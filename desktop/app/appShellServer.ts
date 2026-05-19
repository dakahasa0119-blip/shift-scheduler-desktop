import type { MonthlyScheduleDocument } from "../core/domain";
import { sampleMonthlyScheduleDocument } from "../core/fixtures";
import { renderScheduleTsv } from "../core/scheduleTsv";
import { AppController } from "./appController";
import type { DesktopApiClient } from "./desktopApiClient";
import { DesktopAppRuntime, type DesktopAppRuntimeOptions } from "./appRuntime";
import { renderAppHtml } from "./htmlRenderer";

declare const require: (name: string) => any;
declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
};
declare const Buffer: {
  byteLength(input: string, encoding?: string): number;
};

const http = require("node:http");
const fs = require("node:fs/promises");

export interface AppShellServerOptions {
  runtimeOptions: DesktopAppRuntimeOptions;
  document?: MonthlyScheduleDocument;
  host?: string;
  port?: number;
}

export interface AppShellServer {
  host: string;
  port: number;
  url: string;
  close(): Promise<void>;
}

export async function startAppShellServer(options: AppShellServerOptions): Promise<AppShellServer> {
  const host = options.host || "127.0.0.1";
  const runtime = new DesktopAppRuntime(options.runtimeOptions);
  const runtimeState = await runtime.start();
  if (runtimeState.status !== "ready") {
    throw new Error(runtimeState.lastError || "desktop runtime failed to start");
  }

  const client = runtime.getClient();
  const initialDocument = options.document || (await loadInitialDocument(client)) || sampleMonthlyScheduleDocument;
  const controller = new AppController(initialDocument, client);
  const server = http.createServer((request: any, response: any) => {
    const path = String(request.url || "/").split("?")[0];
    handleShellRequest(path, request, response, controller).catch((error) => {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end(error instanceof Error ? error.message : String(error));
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : options.port || 0;

  return {
    host,
    port,
    url: `http://${host}:${port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error?: Error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      await runtime.stop();
    },
  };
}

async function handleShellRequest(path: string, request: any, response: any, controller: AppController): Promise<void> {
  const method = String(request.method || "GET").toUpperCase();
  if (method === "GET" && path === "/") {
    sendHtml(response, renderAppHtml(controller.getState().viewModel, { interactive: true, actionBasePath: "/app" }));
    return;
  }

  if (method === "POST" && path === "/app/validate") {
    const state = await controller.validate();
    sendHtml(response, renderAppHtml(state.viewModel, { interactive: true, actionBasePath: "/app" }));
    return;
  }

  if (method === "POST" && path === "/app/solve") {
    const state = await controller.solve();
    sendHtml(response, renderAppHtml(state.viewModel, { interactive: true, actionBasePath: "/app" }));
    return;
  }

  if (method === "POST" && path === "/app/save") {
    const state = await controller.save();
    sendHtml(response, renderAppHtml(state.viewModel, { interactive: true, actionBasePath: "/app" }));
    return;
  }

  if (method === "POST" && path === "/app/load") {
    const state = await controller.load();
    sendHtml(response, renderAppHtml(state.viewModel, { interactive: true, actionBasePath: "/app" }));
    return;
  }

  if (method === "POST" && path === "/app/backup") {
    const state = await controller.backup();
    sendHtml(response, renderAppHtml(state.viewModel, { interactive: true, actionBasePath: "/app" }));
    return;
  }

  if (method === "POST" && path === "/app/import/json") {
    const body = (await readJsonBody(request, 10 * 1024 * 1024)) as { documentText?: string };
    const state = controller.importJson(body.documentText || "");
    sendHtml(response, renderAppHtml(state.viewModel, { interactive: true, actionBasePath: "/app" }));
    return;
  }

  if (method === "POST" && path === "/app/import/settings") {
    const body = await readJsonBody(request, 1024 * 1024);
    const state = controller.updateSettings(body);
    sendHtml(response, renderAppHtml(state.viewModel, { interactive: true, actionBasePath: "/app" }));
    return;
  }

  if (method === "POST" && path === "/app/import/schedule-tsv") {
    const body = (await readJsonBody(request, 10 * 1024 * 1024)) as { scheduleText?: string };
    const state = controller.importScheduleTsv(body.scheduleText || "");
    sendHtml(response, renderAppHtml(state.viewModel, { interactive: true, actionBasePath: "/app" }));
    return;
  }

  if ((method === "GET" || method === "POST") && path === "/app/export/schedule-tsv") {
    const body = renderScheduleTsv(controller.getState().document);
    response.writeHead(200, {
      "content-type": "text/tab-separated-values; charset=utf-8",
      "cache-control": "no-store",
      "content-length": Buffer.byteLength(body, "utf8"),
    });
    response.end(body);
    return;
  }

  if ((method === "GET" || method === "POST") && path === "/app/export/json") {
    const body = `${JSON.stringify(controller.getState().document, null, 2)}\n`;
    response.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "content-length": Buffer.byteLength(body, "utf8"),
    });
    response.end(body);
    return;
  }

  if ((method === "GET" || method === "POST") && path === "/app/export/excel") {
    const result = await controller.exportExcel();
    if (!result.ok) {
      response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      response.end(result.userMessage);
      return;
    }
    sendFile(response, result.filePath, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return;
  }

  if ((method === "GET" || method === "POST") && path === "/app/export/pdf") {
    const result = await controller.exportPdf();
    if (!result.ok) {
      response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      response.end(result.userMessage);
      return;
    }
    sendFile(response, result.filePath, result.format === "pdf" ? "application/pdf" : "text/html; charset=utf-8");
    return;
  }

  response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  response.end("not found");
}

async function loadInitialDocument(client: Pick<DesktopApiClient, "loadDocument">): Promise<MonthlyScheduleDocument | null> {
  try {
    const response = await client.loadDocument();
    return response.ok ? response.document : null;
  } catch {
    return null;
  }
}

function sendHtml(response: any, html: string): void {
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(html);
}

async function sendFile(response: any, filePath: string, contentType: string): Promise<void> {
  const content = await fs.readFile(filePath);
  response.writeHead(200, {
    "content-type": contentType,
    "cache-control": "no-store",
  });
  response.end(content);
}

async function readJsonBody(request: any, maxBodyBytes: number): Promise<unknown> {
  const chunks: string[] = [];
  let receivedBytes = 0;
  await new Promise<void>((resolve, reject) => {
    request.on("data", (chunk: unknown) => {
      const text = String(chunk);
      receivedBytes += Buffer.byteLength(text, "utf8");
      if (receivedBytes > maxBodyBytes) {
        reject(new Error("request body too large"));
        request.destroy();
        return;
      }
      chunks.push(text);
    });
    request.on("end", resolve);
    request.on("error", reject);
  });
  const raw = chunks.join("").trim();
  return raw ? JSON.parse(raw) : {};
}

async function main(): Promise<void> {
  const portArg = process.argv.find((arg) => arg.startsWith("--port="));
  const port = portArg ? Number(portArg.replace("--port=", "")) : Number(process.env.PORT || 0);
  const server = await startAppShellServer({
    port: Number.isFinite(port) && port > 0 ? port : undefined,
    runtimeOptions: {
      appVersion: "0.1.0-shell",
      defaultTimeLimitSeconds: 10,
    },
  });
  console.log(`desktop app shell: ${server.url}`);
}

if (process.argv.some((arg) => arg.endsWith("desktop/app/appShellServer.ts") || arg.endsWith("appShellServer.ts"))) {
  main().catch((error) => {
    console.error(error);
    throw error;
  });
}
