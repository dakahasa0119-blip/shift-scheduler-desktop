import { startAppShellServer } from "../app/appShellServer";

declare const require: (name: string) => any;
declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  exitCode?: number;
  on(event: string, listener: () => void): void;
};
declare const Buffer: {
  from(input: string, encoding?: string): { toString(encoding?: string): string };
};

const http = require("node:http");

interface PublicGatewayOptions {
  host?: string;
  port?: number;
  username: string;
  password: string;
}

export async function startPublicGateway(options: PublicGatewayOptions) {
  if (!options.username || !options.password) {
    throw new Error("WEB_UI_USER and WEB_UI_PASSWORD are required");
  }

  // Keep the actual app shell and its local API loopback-only. The public server
  // below is only an authenticated reverse proxy.
  const shell = await startAppShellServer({
    host: "127.0.0.1",
    runtimeOptions: {
      appVersion: "0.2.0-web-preview",
      defaultTimeLimitSeconds: 240,
    },
  });

  const expected = `Basic ${Buffer.from(`${options.username}:${options.password}`, "utf8").toString("base64")}`;
  const server = http.createServer((request: any, response: any) => {
    if (String(request.headers?.authorization || "") !== expected) {
      response.writeHead(401, {
        "www-authenticate": 'Basic realm="Shift Scheduler"',
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end("Authentication required");
      return;
    }

    const forwardedHeaders = { ...(request.headers || {}) };
    delete forwardedHeaders.authorization;
    forwardedHeaders.host = `127.0.0.1:${shell.port}`;

    const target = http.request(
      {
        hostname: "127.0.0.1",
        port: shell.port,
        path: request.url || "/",
        method: request.method || "GET",
        headers: forwardedHeaders,
      },
      (upstream: any) => {
        const headers = { ...upstream.headers };
        delete headers["www-authenticate"];
        response.writeHead(upstream.statusCode || 502, headers);
        upstream.pipe(response);
      },
    );

    target.on("error", (error: Error) => {
      if (!response.headersSent) {
        response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
      }
      response.end(error.message);
    });
    request.pipe(target);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port || 3000, options.host || "0.0.0.0", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const close = async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error?: Error) => (error ? reject(error) : resolve()));
    });
    await shell.close();
  };

  return { server, shell, close };
}

async function main(): Promise<void> {
  const port = Number(process.env.PORT || 3000);
  const username = process.env.WEB_UI_USER || "";
  const password = process.env.WEB_UI_PASSWORD || "";
  const gateway = await startPublicGateway({
    host: "0.0.0.0",
    port: Number.isFinite(port) && port > 0 ? port : 3000,
    username,
    password,
  });
  console.log(`authenticated web gateway listening on 0.0.0.0:${port}`);

  const shutdown = () => {
    gateway.close().catch(() => {});
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (process.argv.some((arg) => arg.endsWith("desktop/web/publicServer.ts") || arg.endsWith("publicServer.ts"))) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
