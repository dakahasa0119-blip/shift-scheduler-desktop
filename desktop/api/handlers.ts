import type {
  BackupDocumentRequest,
  BackupDocumentResponse,
  ExportExcelRequest,
  ExportExcelResponse,
  ExportPdfRequest,
  ExportPdfResponse,
  HealthResponse,
  LoadDocumentResponse,
  RecoverScheduleRequest,
  RecoverScheduleResponse,
  ScheduleDiff,
  SolverRecoveryDiff,
  SaveDocumentRequest,
  SaveDocumentResponse,
  SolveScheduleRequest,
  SolveScheduleResponse,
  ValidateScheduleRequest,
  ValidateScheduleResponse,
} from "./contracts";
import { exportFailed, internalError, solverFailed, solverTimedOut, storageFailed, validationFailed } from "./errors";
import { buildSolverInputPayload, type SolverInputPayload } from "../core/solverInput";
import { applySolverOutputToDocument, type SolverOutputPayload } from "../core/solverOutput";
import { validateMonthlyScheduleDocument } from "../core/validation";
import {
  exportExcelWorkbook,
  exportPdfFile,
  exportPdfPrintHtml,
  type ExportBinaryFileWriter,
  type ExportPathProvider,
} from "../exports/exportFileWriter";
import type { PdfRenderer } from "../exports/pdfRenderer";
import type { DocumentStore } from "../storage/jsonDocumentStore";
import { SolverInvocationError } from "../solver/bundledSolverRunner";

export interface ApiHandlerDependencies {
  appVersion: string;
  now: () => Date;
  solver: SolverRunner;
  exports?: ExportDependencies;
  storage?: DocumentStore;
  logger?: ApiLogger;
}

export interface ExportDependencies {
  writer: ExportBinaryFileWriter;
  paths: ExportPathProvider;
  pdfRenderer?: PdfRenderer;
}

export interface SolverRunner {
  solve(input: SolverInputPayload, options: SolverRunOptions): Promise<SolverOutputPayload>;
}

export interface SolverRunOptions {
  timeLimitSeconds: number;
  mode: "create" | "recreate" | "recovery";
}

export interface ApiLogger {
  error(message: string, details?: unknown): void;
  info?(message: string, details?: unknown): void;
}

export function handleHealth(deps: Pick<ApiHandlerDependencies, "appVersion">): HealthResponse {
  return {
    ok: true,
    status: "ready",
    app: "shift-desktop-local-api",
    version: deps.appVersion,
  };
}

export function handleValidateSchedule(request: ValidateScheduleRequest): ValidateScheduleResponse {
  const validation = validateMonthlyScheduleDocument(request.document);
  return {
    ok: true,
    validation,
  };
}

export async function handleSolveSchedule(
  request: SolveScheduleRequest,
  deps: ApiHandlerDependencies,
): Promise<SolveScheduleResponse> {
  try {
    const validation = validateMonthlyScheduleDocument(request.document);
    if (!validation.ok) {
      return validationFailed({ issues: validation.issues });
    }

    const solverInput = buildSolverInputPayload(request.document, formatGeneratedAt(deps.now()));
    const solverOutput = await deps.solver.solve(solverInput, {
      timeLimitSeconds: normalizeTimeLimit(request.options?.timeLimitSeconds),
      mode: request.options?.mode || "create",
    });
    const document = applySolverOutputToDocument(request.document, solverOutput);

    if (!document.diagnostics) {
      return solverFailed({ reason: "missing diagnostics" });
    }

    return {
      ok: true,
      document,
      diagnostics: document.diagnostics,
      messages: document.diagnostics.messages,
    };
  } catch (error) {
    deps.logger?.error("solve schedule failed", error);
    if (isSolverTimeout(error)) {
      return solverTimedOut({ timeLimitSeconds: normalizeTimeLimit(request.options?.timeLimitSeconds) });
    }
    if (error instanceof SolverInvocationError) {
      return solverFailed({ exitCode: error.exitCode, output: error.output });
    }
    return internalError(error instanceof Error ? { message: error.message } : error);
  }
}

export async function handleRecoverSchedule(
  request: RecoverScheduleRequest,
  deps: ApiHandlerDependencies,
): Promise<RecoverScheduleResponse> {
  try {
    const validation = validateMonthlyScheduleDocument(request.document);
    if (!validation.ok) {
      return validationFailed({ issues: validation.issues });
    }
    if (!request.urgentLeaves?.length) {
      return validationFailed({ issues: [{ severity: "error", path: "urgentLeaves", message: "急休対象を入力してください" }] });
    }

    const solverInput = buildSolverInputPayload(request.document, formatGeneratedAt(deps.now()), {
      fixedThroughDate: request.options?.fixedThroughDate,
      urgentLeaves: request.urgentLeaves.map((entry) => ({
        staffId: entry.staffId,
        date: entry.date,
        reason: entry.reason,
        notes: entry.notes,
      })),
    });
    const solverOutput = await deps.solver.solve(solverInput, {
      timeLimitSeconds: normalizeTimeLimit(request.options?.timeLimitSeconds),
      mode: "recovery",
    });
    const document = applySolverOutputToDocument(request.document, solverOutput);

    if (!document.diagnostics) {
      return solverFailed({ reason: "missing diagnostics" });
    }

    return {
      ok: true,
      document,
      diagnostics: document.diagnostics,
      messages: document.diagnostics.messages,
      diffs: normalizeRecoveryDiffs(request.document, solverOutput.diagnostics?.recoveryDiffs || []),
    };
  } catch (error) {
    deps.logger?.error("recover schedule failed", error);
    if (isSolverTimeout(error)) {
      return solverTimedOut({ timeLimitSeconds: normalizeTimeLimit(request.options?.timeLimitSeconds) });
    }
    if (error instanceof SolverInvocationError) {
      return solverFailed({ exitCode: error.exitCode, output: error.output });
    }
    return internalError(error instanceof Error ? { message: error.message } : error);
  }
}

export async function handleExportExcel(
  request: ExportExcelRequest,
  deps: Pick<ApiHandlerDependencies, "exports" | "logger">,
): Promise<ExportExcelResponse> {
  try {
    if (!deps.exports) {
      return exportFailed({ reason: "export dependencies are not configured" });
    }

    const validation = validateMonthlyScheduleDocument(request.document);
    if (!validation.ok) {
      return validationFailed({ issues: validation.issues });
    }

    const result = await exportExcelWorkbook({
      document: request.document,
      destinationPath: request.destinationPath,
      writer: deps.exports.writer,
      paths: deps.exports.paths,
    });

    return {
      ok: true,
      filePath: result.filePath,
    };
  } catch (error) {
    deps.logger?.error("export excel failed", error);
    return exportFailed(error instanceof Error ? { message: error.message } : error);
  }
}

export async function handleExportPdf(
  request: ExportPdfRequest,
  deps: Pick<ApiHandlerDependencies, "exports" | "logger">,
): Promise<ExportPdfResponse> {
  try {
    if (!deps.exports) {
      return exportFailed({ reason: "export dependencies are not configured" });
    }

    const validation = validateMonthlyScheduleDocument(request.document);
    if (!validation.ok) {
      return validationFailed({ issues: validation.issues });
    }

    const result = deps.exports.pdfRenderer
      ? await exportPdfFile({
          document: request.document,
          destinationPath: request.destinationPath,
          writer: deps.exports.writer,
          paths: deps.exports.paths,
          renderer: deps.exports.pdfRenderer,
        })
      : await exportPdfPrintHtml({
          document: request.document,
          destinationPath: request.destinationPath,
          writer: deps.exports.writer,
          paths: deps.exports.paths,
        });

    return {
      ok: true,
      filePath: result.filePath,
      format: result.format,
    };
  } catch (error) {
    deps.logger?.error("export pdf failed", error);
    return exportFailed(error instanceof Error ? { message: error.message } : error);
  }
}

export async function handleSaveDocument(
  request: SaveDocumentRequest,
  deps: Pick<ApiHandlerDependencies, "storage" | "logger">,
): Promise<SaveDocumentResponse> {
  try {
    if (!deps.storage) {
      return storageFailed({ reason: "storage dependency is not configured" });
    }
    const validation = validateMonthlyScheduleDocument(request.document);
    if (!validation.ok) {
      return validationFailed({ issues: validation.issues });
    }
    const result = await deps.storage.save(request.document);
    return {
      ok: true,
      filePath: result.filePath,
    };
  } catch (error) {
    deps.logger?.error("save document failed", error);
    return storageFailed(error instanceof Error ? { message: error.message } : error);
  }
}

export async function handleLoadDocument(
  deps: Pick<ApiHandlerDependencies, "storage" | "logger">,
): Promise<LoadDocumentResponse> {
  try {
    if (!deps.storage) {
      return storageFailed({ reason: "storage dependency is not configured" });
    }
    const result = await deps.storage.load();
    return {
      ok: true,
      document: result.document,
      filePath: result.filePath,
    };
  } catch (error) {
    deps.logger?.error("load document failed", error);
    return storageFailed(error instanceof Error ? { message: error.message } : error);
  }
}

export async function handleBackupDocument(
  request: BackupDocumentRequest,
  deps: Pick<ApiHandlerDependencies, "storage" | "logger">,
): Promise<BackupDocumentResponse> {
  try {
    if (!deps.storage) {
      return storageFailed({ reason: "storage dependency is not configured" });
    }
    const validation = validateMonthlyScheduleDocument(request.document);
    if (!validation.ok) {
      return validationFailed({ issues: validation.issues });
    }
    const result = await deps.storage.backup(request.document);
    return {
      ok: true,
      filePath: result.filePath,
    };
  } catch (error) {
    deps.logger?.error("backup document failed", error);
    return storageFailed(error instanceof Error ? { message: error.message } : error);
  }
}

function normalizeTimeLimit(value: number | undefined): number {
  if (!Number.isFinite(value || NaN)) return 240;
  return Math.max(10, Math.min(1800, Math.round(Number(value))));
}

function isSolverTimeout(error: unknown): boolean {
  return error instanceof SolverInvocationError && error.exitCode === -2;
}

function formatGeneratedAt(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
    " ",
    pad(date.getHours()),
    ":",
    pad(date.getMinutes()),
    ":",
    pad(date.getSeconds()),
  ].join("");
}

function normalizeRecoveryDiffs(document: RecoverScheduleRequest["document"], diffs: SolverRecoveryDiff[]): ScheduleDiff[] {
  const staffByName = new Map(document.staff.map((staff) => [staff.name, staff]));
  return diffs.map((diff) => {
    const name = String(diff.name || "");
    const staff = staffByName.get(name);
    return {
      date: String(diff.date || ""),
      staffId: staff?.id || `unmatched:${name}`,
      name,
      before: String(diff.before || ""),
      after: String(diff.after || ""),
      labels: (diff.labels || []).map(String),
    };
  });
}
