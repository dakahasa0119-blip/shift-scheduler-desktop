import type { MonthlyScheduleDocument } from "../core/domain";
import { renderAiDebugBundleJson } from "../core/aiDebugBundle";
import { renderCapacitySimulationJson } from "../core/capacitySimulation";
import { createBlankMonthlyScheduleDocument } from "../core/fixtures";
import { renderRequestsTsv, renderStaffTsv } from "../core/inputTsv";
import { renderActualScheduleTsv, renderChangeHistoryTsv, renderUrgentLeaveHistoryTsv } from "../core/operationalRecords";
import { renderScheduleTsv } from "../core/scheduleTsv";
import { renderSolverInputJson } from "../core/solverJsonExchange";
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
  const initialDocument = options.document || (await loadInitialDocument(client)) || createBlankMonthlyScheduleDocument();
  const controller = new AppController(initialDocument, client);
  let closing = false;
  const closeShell = async () => {
    if (closing) return;
    closing = true;
    await shell.close();
  };
  const server = http.createServer((request: any, response: any) => {
    const path = String(request.url || "/").split("?")[0];
    handleShellRequest(path, request, response, controller, closeShell).catch((error) => {
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

  const shell: AppShellServer = {
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
  return shell;
}

async function handleShellRequest(
  path: string,
  request: any,
  response: any,
  controller: AppController,
  closeShell: () => Promise<void>,
): Promise<void> {
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

  if (method === "POST" && path === "/app/monthly-precheck") {
    const state = controller.runMonthlyTransitionPrecheck();
    sendHtml(response, renderAppHtml(state.viewModel, { interactive: true, actionBasePath: "/app" }));
    return;
  }

  if (method === "POST" && path === "/app/monthly-transition") {
    const state = controller.runMonthlyTransition();
    sendHtml(response, renderAppHtml(state.viewModel, { interactive: true, actionBasePath: "/app" }));
    return;
  }

  if (method === "POST" && path === "/app/monthly-archive") {
    const state = controller.runMonthlyArchiveForCurrentOperationMonth();
    sendHtml(response, renderAppHtml(state.viewModel, { interactive: true, actionBasePath: "/app" }));
    return;
  }

  if (method === "POST" && path === "/app/start-next-month-planning") {
    const state = controller.startNextMonthPlanning();
    sendHtml(response, renderAppHtml(state.viewModel, { interactive: true, actionBasePath: "/app" }));
    return;
  }

  if (method === "POST" && path === "/app/promote-operation-month") {
    const state = controller.promoteTargetMonthToOperationMonth();
    sendHtml(response, renderAppHtml(state.viewModel, { interactive: true, actionBasePath: "/app" }));
    return;
  }

  if (method === "POST" && path === "/app/repair-calendar") {
    const state = controller.repairCurrentShiftCalendar();
    sendHtml(response, renderAppHtml(state.viewModel, { interactive: true, actionBasePath: "/app" }));
    return;
  }

  if (method === "POST" && path === "/app/setup-initial-settings") {
    const state = controller.setupInitialSettings();
    sendHtml(response, renderAppHtml(state.viewModel, { interactive: true, actionBasePath: "/app" }));
    return;
  }

  if (method === "POST" && path === "/app/normalize-staff-columns") {
    const state = controller.normalizeStaffColumns();
    sendHtml(response, renderAppHtml(state.viewModel, { interactive: true, actionBasePath: "/app" }));
    return;
  }

  if (method === "POST" && path === "/app/fix-dropdown-lists") {
    const state = controller.fixDropdownLists();
    sendHtml(response, renderAppHtml(state.viewModel, { interactive: true, actionBasePath: "/app" }));
    return;
  }

  if (method === "POST" && path === "/app/check-solver-connection") {
    const state = await controller.checkSolverConnection();
    sendHtml(response, renderAppHtml(state.viewModel, { interactive: true, actionBasePath: "/app" }));
    return;
  }

  if (method === "POST" && path === "/app/post-edit-recheck") {
    const state = controller.runPostEditScheduleRecheck();
    sendHtml(response, renderAppHtml(state.viewModel, { interactive: true, actionBasePath: "/app" }));
    return;
  }

  if (method === "POST" && path === "/app/solve") {
    const state = await controller.solve();
    sendHtml(response, renderAppHtml(state.viewModel, { interactive: true, actionBasePath: "/app" }));
    return;
  }

  if (method === "POST" && path === "/app/recover") {
    const body = (await readJsonBody(request, 10 * 1024 * 1024)) as {
      urgentLeaveText?: string;
      fixedThroughDate?: string;
    };
    const state = await controller.recover(body.urgentLeaveText || "", body.fixedThroughDate || "");
    sendHtml(response, renderAppHtml(state.viewModel, { interactive: true, actionBasePath: "/app" }));
    return;
  }

  if (method === "POST" && path === "/app/create-actual") {
    const state = controller.createActualSchedule();
    sendHtml(response, renderAppHtml(state.viewModel, { interactive: true, actionBasePath: "/app" }));
    return;
  }

  if (method === "POST" && path === "/app/add-leave-request") {
    const body = await readJsonBody(request, 1024 * 1024);
    const state = controller.addLeaveRequest(body);
    sendHtml(response, renderAppHtml(state.viewModel, { interactive: true, actionBasePath: "/app" }));
    return;
  }

  if (method === "POST" && path === "/app/cancel-planned-leave") {
    const body = await readJsonBody(request, 1024 * 1024);
    const state = controller.cancelPlannedLeave(body);
    sendHtml(response, renderAppHtml(state.viewModel, { interactive: true, actionBasePath: "/app" }));
    return;
  }

  if (method === "POST" && path === "/app/cancel-urgent-leave") {
    const body = await readJsonBody(request, 1024 * 1024);
    const state = controller.cancelUrgentLeave(body);
    sendHtml(response, renderAppHtml(state.viewModel, { interactive: true, actionBasePath: "/app" }));
    return;
  }

  if (method === "POST" && path === "/app/run-capacity-simulation") {
    const state = controller.runCapacitySimulation();
    sendHtml(response, renderAppHtml(state.viewModel, { interactive: true, actionBasePath: "/app" }));
    return;
  }

  if (method === "POST" && path === "/app/refresh-capacity-simulation") {
    const state = controller.refreshCapacitySimulation();
    sendHtml(response, renderAppHtml(state.viewModel, { interactive: true, actionBasePath: "/app" }));
    return;
  }

  if (method === "POST" && path === "/app/import/capacity-simulation-json") {
    const body = (await readJsonBody(request, 10 * 1024 * 1024)) as { capacitySimulationText?: string };
    const state = controller.importCapacitySimulationJson(body.capacitySimulationText || "");
    sendHtml(response, renderAppHtml(state.viewModel, { interactive: true, actionBasePath: "/app" }));
    return;
  }

  if (method === "POST" && path === "/app/import/solver-output-json") {
    const body = (await readJsonBody(request, 10 * 1024 * 1024)) as { solverOutputText?: string };
    const state = controller.importSolverOutputJson(body.solverOutputText || "");
    sendHtml(response, renderAppHtml(state.viewModel, { interactive: true, actionBasePath: "/app" }));
    return;
  }

  if (method === "POST" && path === "/app/ensure-history") {
    const state = controller.ensureHistory();
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

  if (method === "POST" && path === "/app/import/actual-schedule-tsv") {
    const body = (await readJsonBody(request, 10 * 1024 * 1024)) as { actualScheduleText?: string };
    const state = controller.importActualScheduleTsv(body.actualScheduleText || "");
    sendHtml(response, renderAppHtml(state.viewModel, { interactive: true, actionBasePath: "/app" }));
    return;
  }

  if (method === "POST" && path === "/app/import/staff-tsv") {
    const body = (await readJsonBody(request, 10 * 1024 * 1024)) as { staffText?: string };
    const state = controller.importStaffTsv(body.staffText || "");
    sendHtml(response, renderAppHtml(state.viewModel, { interactive: true, actionBasePath: "/app" }));
    return;
  }

  if (method === "POST" && path === "/app/import/requests-tsv") {
    const body = (await readJsonBody(request, 10 * 1024 * 1024)) as { requestsText?: string };
    const state = controller.importRequestsTsv(body.requestsText || "");
    sendHtml(response, renderAppHtml(state.viewModel, { interactive: true, actionBasePath: "/app" }));
    return;
  }

  if ((method === "GET" || method === "POST") && path === "/app/export/staff-tsv") {
    sendTsv(response, renderStaffTsv(controller.getState().document));
    return;
  }

  if ((method === "GET" || method === "POST") && path === "/app/export/requests-tsv") {
    sendTsv(response, renderRequestsTsv(controller.getState().document));
    return;
  }

  if ((method === "GET" || method === "POST") && path === "/app/export/schedule-tsv") {
    sendTsv(response, renderScheduleTsv(controller.getState().document));
    return;
  }

  if ((method === "GET" || method === "POST") && path === "/app/export/actual-schedule-tsv") {
    sendTsv(response, renderActualScheduleTsv(controller.getState().document));
    return;
  }

  if ((method === "GET" || method === "POST") && path === "/app/export/change-history-tsv") {
    sendTsv(response, renderChangeHistoryTsv(controller.getState().document));
    return;
  }

  if ((method === "GET" || method === "POST") && path === "/app/export/urgent-leave-history-tsv") {
    sendTsv(response, renderUrgentLeaveHistoryTsv(controller.getState().document));
    return;
  }

  if ((method === "GET" || method === "POST") && path === "/app/export/ai-debug-json") {
    sendJson(response, renderAiDebugBundleJson(controller.getState().document));
    return;
  }

  if ((method === "GET" || method === "POST") && path === "/app/export/capacity-simulation-json") {
    sendJson(response, renderCapacitySimulationJson(controller.getState().document));
    return;
  }

  if ((method === "GET" || method === "POST") && path === "/app/export/solver-input-json") {
    sendJson(response, renderSolverInputJson(controller.getState().document));
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

  if (method === "POST" && path === "/app/quit") {
    sendHtml(response, renderQuitHtml());
    setTimeout(() => {
      closeShell().catch(() => {});
    }, 25);
    return;
  }

  response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  response.end("not found");
}

function renderQuitHtml(): string {
  return [
    "<!doctype html>",
    '<html lang="ja">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>勤務表作成 - 終了</title>",
    "<style>",
    "body{margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f6f8;color:#17202a;display:grid;place-items:center;min-height:100vh}",
    "main{background:#fff;border:1px solid #d7dce2;border-radius:8px;padding:24px;max-width:420px}",
    "h1{font-size:20px;margin:0 0 8px}",
    "p{margin:0;color:#5e6a75;line-height:1.6}",
    "</style>",
    "</head>",
    "<body>",
    "<main>",
    "<h1>勤務表作成を終了しました</h1>",
    "<p>このブラウザタブを閉じてください。</p>",
    "</main>",
    "</body>",
    "</html>",
  ].join("\n");
}

function sendTsv(response: any, body: string): void {
  response.writeHead(200, {
    "content-type": "text/tab-separated-values; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body, "utf8"),
  });
  response.end(body);
}

function sendJson(response: any, body: string): void {
  response.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body, "utf8"),
  });
  response.end(body);
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
