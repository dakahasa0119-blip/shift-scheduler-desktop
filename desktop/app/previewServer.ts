import { MockSolverRunner } from "../api/mockSolverRunner";
import { handleSolveSchedule, handleValidateSchedule } from "../api/handlers";
import { sampleMonthlyScheduleDocument } from "../core/fixtures";
import type { MonthlyScheduleDocument } from "../core/domain";
import {
  buildAppViewModelFromDocument,
  buildAppViewModelFromSolveResponse,
  buildAppViewModelFromValidateResponse,
  buildInitialAppViewModel,
} from "./appViewModel";
import { renderAppHtml } from "./htmlRenderer";
import { buildExportWorkbook } from "../exports/exportWorkbook";
import { renderWorkbookAsXlsx } from "../exports/xlsxWriter";
import { renderWorkbookAsPrintHtml } from "../exports/printHtmlWriter";
import { ChromePdfRenderer } from "../exports/pdfRenderer";
import {
  detectChromeExecutable,
  NodePdfFileSystem,
  NodePdfProcessExecutor,
  NodePdfTempFileProvider,
} from "../exports/nodePdfRuntime";

declare const require: {
  (name: string): any;
  main?: unknown;
};
declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
};

const http = require("node:http");
const fs = require("node:fs/promises");
const pathModule = require("node:path");
const os = require("node:os");

export interface PreviewServer {
  host: string;
  port: number;
  url: string;
  close(): Promise<void>;
}

export interface PreviewServerOptions {
  host?: string;
  port?: number;
}

export async function startPreviewServer(options: PreviewServerOptions = {}): Promise<PreviewServer> {
  const host = options.host || "127.0.0.1";
  const solver = new MockSolverRunner();
  let currentDocument = sampleMonthlyScheduleDocument;
  const server = http.createServer((request: any, response: any) => {
    const path = String(request.url || "/").split("?")[0];
    handlePreviewRequest(path, request, response, {
      solver,
      getDocument: () => currentDocument,
      setDocument: (document) => {
        currentDocument = document;
      },
    }).catch((error) => {
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
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error?: Error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}

interface PreviewState {
  solver: MockSolverRunner;
  getDocument(): MonthlyScheduleDocument;
  setDocument(document: MonthlyScheduleDocument): void;
}

async function handlePreviewRequest(path: string, request: any, response: any, state: PreviewState): Promise<void> {
  const method = String(request.method || "GET").toUpperCase();
  if (method === "GET" && path === "/") {
    sendHtml(response, renderAppHtml(buildInitialAppViewModel(state.getDocument()), { interactive: true }));
    return;
  }

  if (method === "POST" && path === "/preview/validate") {
    const result = handleValidateSchedule({ document: state.getDocument() });
    sendHtml(response, renderAppHtml(buildAppViewModelFromValidateResponse(state.getDocument(), result), { interactive: true }));
    return;
  }

  if (method === "POST" && path === "/preview/solve") {
    const html = await buildSolvedPreviewHtml(state);
    sendHtml(response, html);
    return;
  }

  if ((method === "GET" || method === "POST") && path === "/preview/export/excel") {
    const viewModel = buildAppViewModelFromDocument(state.getDocument());
    const workbook = buildExportWorkbook(viewModel);
    sendXlsx(response, "schedule.xlsx", renderWorkbookAsXlsx(workbook));
    return;
  }

  if ((method === "GET" || method === "POST") && path === "/preview/export/pdf") {
    const viewModel = buildAppViewModelFromDocument(state.getDocument());
    const workbook = buildExportWorkbook(viewModel);
    const html = renderWorkbookAsPrintHtml(workbook);
    const pdf = await tryRenderPdf(html);
    if (pdf) sendPdf(response, "schedule.pdf", pdf);
    else sendHtml(response, html);
    return;
  }

  response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  response.end("not found");
}

async function buildSolvedPreviewHtml(state: PreviewState): Promise<string> {
  const response = await handleSolveSchedule(
    {
      document: state.getDocument(),
      options: {
        mode: "create",
        timeLimitSeconds: 10,
      },
    },
    {
      appVersion: "0.1.0-preview",
      now: () => new Date(2026, 4, 19, 20, 0, 0),
      solver: state.solver,
    },
  );
  if (response.ok) state.setDocument(response.document);
  return renderAppHtml(buildAppViewModelFromSolveResponse(state.getDocument(), response), { interactive: true });
}

function sendHtml(response: any, html: string): void {
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(html);
}

function sendXlsx(response: any, fileName: string, body: Uint8Array): void {
  response.writeHead(200, {
    "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "content-disposition": `attachment; filename="${fileName}"`,
    "cache-control": "no-store",
  });
  response.end(body);
}

function sendPdf(response: any, fileName: string, body: Uint8Array): void {
  response.writeHead(200, {
    "content-type": "application/pdf",
    "content-disposition": `attachment; filename="${fileName}"`,
    "cache-control": "no-store",
  });
  response.end(body);
}

async function tryRenderPdf(html: string): Promise<Uint8Array | null> {
  const chrome = detectChromeExecutable();
  if (!chrome) return null;
  const directory = await fs.mkdtemp(pathModule.join(os.tmpdir(), "shift-preview-pdf-"));
  const outputPath = pathModule.join(directory, "schedule.pdf");
  const renderer = new ChromePdfRenderer({
    executablePath: chrome,
    files: new NodePdfFileSystem(),
    tempFiles: new NodePdfTempFileProvider(directory),
    process: new NodePdfProcessExecutor(),
    timeoutMs: 30000,
  });
  await renderer.renderHtmlToPdf({
    html,
    destinationPath: outputPath,
  });
  return fs.readFile(outputPath);
}

async function main(): Promise<void> {
  const portArg = process.argv.find((arg) => arg.startsWith("--port="));
  const port = portArg ? Number(portArg.replace("--port=", "")) : Number(process.env.PORT || 0);
  const server = await startPreviewServer({
    port: Number.isFinite(port) && port > 0 ? port : undefined,
  });
  console.log(`desktop preview: ${server.url}`);
}

if (isDirectExecution()) {
  main().catch((error) => {
    console.error(error);
    throw error;
  });
}

function isDirectExecution(): boolean {
  return process.argv.some((arg) => arg.endsWith("desktop/app/previewServer.ts") || arg.endsWith("previewServer.ts"));
}
