import { startAppShellServer } from "../app/appShellServer";

declare const require: (name: string) => any;
declare const process: {
  env: Record<string, string | undefined>;
  on(event: string, listener: () => void): void;
  exitCode?: number;
};
declare const Buffer: {
  from(input: string, encoding?: string): any;
  byteLength(input: string, encoding?: string): number;
};

const http = require("node:http");
const crypto = require("node:crypto");

interface GatewayOptions {
  host: string;
  port: number;
  username: string;
  password: string;
}

function envRequired(name: string): string {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parsePort(value: string | undefined, fallback: number): number {
  const parsed = Number(value || fallback);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) return fallback;
  return parsed;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function authorized(request: any, username: string, password: string): boolean {
  const header = String(request.headers?.authorization || "");
  if (!header.startsWith("Basic ")) return false;
  let decoded = "";
  try {
    decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  } catch {
    return false;
  }
  const separator = decoded.indexOf(":");
  if (separator < 0) return false;
  const suppliedUser = decoded.slice(0, separator);
  const suppliedPassword = decoded.slice(separator + 1);
  return safeEqual(suppliedUser, username) && safeEqual(suppliedPassword, password);
}

function sendUnauthorized(response: any): void {
  response.writeHead(401, {
    "www-authenticate": 'Basic realm="Shift Scheduler Preview", charset="UTF-8"',
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end("authentication required");
}

function sendHealth(response: any): void {
  const body = JSON.stringify({ ok: true, service: "shift-scheduler-web" });
  response.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body, "utf8"),
  });
  response.end(body);
}

async function main(): Promise<void> {
  const options: GatewayOptions = {
    host: process.env.WEB_HOST || "0.0.0.0",
    port: parsePort(process.env.PORT, 3000),
    username: envRequired("WEB_USERNAME"),
    password: envRequired("WEB_PASSWORD"),
  };

  const shell = await startAppShellServer({
    host: "127.0.0.1",
    runtimeOptions: {
      appVersion: "0.1.0-web-preview",
      defaultTimeLimitSeconds: parsePort(process.env.SOLVER_TIME_LIMIT_SECONDS, 30),
    },
  });

  const upstream = new URL(shell.url);
  const server = http.createServer((request: any, response: any) => {
    const path = String(request.url || "/").split("?")[0];

    if (request.method === "GET" && path === "/healthz") {
      sendHealth(response);
      return;
    }

    if (!authorized(request, options.username, options.password)) {
      sendUnauthorized(response);
      return;
    }

    if (request.method === "POST" && path === "/app/quit") {
      response.writeHead(403, {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end("quit is disabled in web preview");
      return;
    }

    const proxyRequest = http.request(
      {
        hostname: upstream.hostname,
        port: Number(upstream.port),
        path: request.url,
        method: request.method,
        headers: {
          ...request.headers,
          host: upstream.host,
          authorization: undefined,
          "x-forwarded-proto": "https",
        },
      },
      (proxyResponse: any) => {
        const headers = { ...proxyResponse.headers };
        delete headers["www-authenticate"];
        headers["cache-control"] = "no-store";
        headers["x-content-type-options"] = "nosniff";
        headers["x-frame-options"] = "DENY";
        headers["referrer-policy"] = "no-referrer";
        response.writeHead(proxyResponse.statusCode || 502, headers);
        proxyResponse.pipe(response);
      },
    );

    proxyRequest.on("error", (error: Error) => {
      if (!response.headersSent) {
        response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
      }
      response.end(`upstream error: ${error.message}`);
    });
    request.pipe(proxyRequest);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const shutdown = () => {
    server.close(() => {
      shell.close().catch(() => {}).finally(() => {
        process.exitCode = 0;
      });
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.log(`shift scheduler web gateway listening on http://${options.host}:${options.port}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
