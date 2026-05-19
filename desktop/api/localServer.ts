import type {
  ApiErrorResponse,
  BackupDocumentRequest,
  ExportExcelRequest,
  ExportPdfRequest,
  RecoverScheduleRequest,
  SaveDocumentRequest,
  SolveScheduleRequest,
  ValidateScheduleRequest,
} from "./contracts";
import type { ApiHandlerDependencies } from "./handlers";
import {
  handleBackupDocument,
  handleExportExcel,
  handleExportPdf,
  handleHealth,
  handleLoadDocument,
  handleRecoverSchedule,
  handleSaveDocument,
  handleSolveSchedule,
  handleValidateSchedule,
} from "./handlers";

declare const require: (name: string) => any;
declare const Buffer: {
  byteLength(input: string, encoding?: string): number;
};

const http = require("node:http");

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_MAX_BODY_BYTES = 5 * 1024 * 1024;

export interface LocalApiServerOptions {
  deps: ApiHandlerDependencies;
  host?: string;
  port?: number;
  maxBodyBytes?: number;
}

export interface LocalApiServer {
  host: string;
  port: number;
  url: string;
  close(): Promise<void>;
}

export async function startLocalApiServer(options: LocalApiServerOptions): Promise<LocalApiServer> {
  const host = options.host || DEFAULT_HOST;
  const maxBodyBytes = options.maxBodyBytes || DEFAULT_MAX_BODY_BYTES;
  const server = http.createServer((request: any, response: any) => {
    routeRequest(request, response, options.deps, maxBodyBytes).catch((error) => {
      options.deps.logger?.error("local api request failed", error);
      sendJson(response, 500, {
        ok: false,
        code: "internal_error",
        message: "local api request failed",
        userMessage: "アプリ内部で問題が発生しました。再起動してもう一度実行してください。",
        details: error instanceof Error ? { message: error.message } : error,
      } satisfies ApiErrorResponse);
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
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error?: Error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}

async function routeRequest(
  request: any,
  response: any,
  deps: ApiHandlerDependencies,
  maxBodyBytes: number,
): Promise<void> {
  const method = String(request.method || "GET").toUpperCase();
  const path = normalizePath(request.url || "/");

  if (method === "GET" && path === "/health") {
    sendJson(response, 200, handleHealth(deps));
    return;
  }

  if (method === "POST" && path === "/schedule/validate") {
    const body = await readJsonBody(request, maxBodyBytes);
    sendJson(response, 200, handleValidateSchedule(body as ValidateScheduleRequest));
    return;
  }

  if (method === "POST" && path === "/schedule/solve") {
    const body = await readJsonBody(request, maxBodyBytes);
    const result = await handleSolveSchedule(body as SolveScheduleRequest, deps);
    sendJson(response, result.ok ? 200 : 400, result);
    return;
  }

  if (method === "POST" && path === "/schedule/recover") {
    const body = await readJsonBody(request, maxBodyBytes);
    const result = await handleRecoverSchedule(body as RecoverScheduleRequest, deps);
    sendJson(response, result.ok ? 200 : 400, result);
    return;
  }

  if (method === "POST" && path === "/export/excel") {
    const body = await readJsonBody(request, maxBodyBytes);
    const result = await handleExportExcel(body as ExportExcelRequest, deps);
    sendJson(response, result.ok ? 200 : 400, result);
    return;
  }

  if (method === "POST" && path === "/export/pdf") {
    const body = await readJsonBody(request, maxBodyBytes);
    const result = await handleExportPdf(body as ExportPdfRequest, deps);
    sendJson(response, result.ok ? 200 : 400, result);
    return;
  }

  if (method === "POST" && path === "/document/save") {
    const body = await readJsonBody(request, maxBodyBytes);
    const result = await handleSaveDocument(body as SaveDocumentRequest, deps);
    sendJson(response, result.ok ? 200 : 400, result);
    return;
  }

  if (method === "GET" && path === "/document/load") {
    const result = await handleLoadDocument(deps);
    sendJson(response, result.ok ? 200 : 400, result);
    return;
  }

  if (method === "POST" && path === "/document/backup") {
    const body = await readJsonBody(request, maxBodyBytes);
    const result = await handleBackupDocument(body as BackupDocumentRequest, deps);
    sendJson(response, result.ok ? 200 : 400, result);
    return;
  }

  sendJson(response, 404, {
    ok: false,
    code: "internal_error",
    message: "route not found",
    userMessage: "この操作は現在のアプリでは利用できません。",
  } satisfies ApiErrorResponse);
}

function normalizePath(url: string): string {
  const queryStart = url.indexOf("?");
  return queryStart >= 0 ? url.slice(0, queryStart) : url;
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
  if (!raw) return {};
  return JSON.parse(raw);
}

function sendJson(response: any, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body, "utf8"),
    "cache-control": "no-store",
  });
  response.end(body);
}
