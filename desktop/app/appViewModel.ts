import type { RecoverScheduleResponse, SolveScheduleResponse, ValidateScheduleResponse } from "../api/contracts";
import type { MonthlyScheduleDocument } from "../core/domain";
import { validateMonthlyScheduleDocument, type ValidationIssue } from "../core/validation";
import { renderScheduleTsv } from "../core/scheduleTsv";
import { renderRequestsTsv, renderStaffTsv } from "../core/inputTsv";
import { renderUrgentLeaveTsv } from "../core/recoveryTsv";
import { buildDiagnosticPanelViewModel, type DiagnosticPanelViewModel } from "./diagnosticViewModel";
import { buildScheduleTableViewModel, type ScheduleTableViewModel } from "./scheduleTableViewModel";

export interface AppViewModel {
  title: string;
  status: AppStatusViewModel;
  documentJson: string;
  staffTsv: string;
  requestsTsv: string;
  urgentLeaveTsv: string;
  scheduleTsv: string;
  settings: AppSettingsViewModel;
  schedule: ScheduleTableViewModel;
  diagnostics: DiagnosticPanelViewModel | null;
  validationIssues: ValidationIssue[];
  actions: AppActionViewModel[];
}

export interface AppSettingsViewModel {
  year: number;
  month: number;
  requirements: {
    early: number;
    day: number;
    late: number;
    night: number;
  };
}

export interface AppStatusViewModel {
  label: string;
  tone: "ready" | "working" | "warning" | "blocked";
}

export interface AppActionViewModel {
  id:
    | "validate"
    | "solve"
    | "recover"
    | "save"
    | "load"
    | "backup"
    | "applySettings"
    | "applyStaffTsv"
    | "exportStaffTsv"
    | "applyRequestsTsv"
    | "exportRequestsTsv"
    | "applyScheduleTsv"
    | "exportScheduleTsv"
    | "applyJson"
    | "exportJson"
    | "exportExcel"
    | "exportPdf"
    | "quit";
  label: string;
  enabled: boolean;
}

export function buildInitialAppViewModel(document: MonthlyScheduleDocument): AppViewModel {
  const validation = validateMonthlyScheduleDocument(document);
  return buildAppViewModelFromParts(document, validation.issues, null, validation.ok);
}

export function buildAppViewModelFromDocument(document: MonthlyScheduleDocument): AppViewModel {
  const validation = validateMonthlyScheduleDocument(document);
  const diagnostics = document.diagnostics ? buildDiagnosticPanelViewModel(document.diagnostics) : null;
  return buildAppViewModelFromParts(document, validation.issues, diagnostics, validation.ok);
}

export function buildAppViewModelFromValidateResponse(
  document: MonthlyScheduleDocument,
  response: ValidateScheduleResponse,
): AppViewModel {
  if (!response.ok) {
    return buildAppViewModelFromParts(document, [], null, false, {
      label: response.userMessage,
      tone: "blocked",
    });
  }

  return buildAppViewModelFromParts(document, response.validation.issues, null, response.validation.ok);
}

export function buildAppViewModelFromSolveResponse(
  fallbackDocument: MonthlyScheduleDocument,
  response: SolveScheduleResponse,
): AppViewModel {
  if (!response.ok) {
    return buildAppViewModelFromParts(fallbackDocument, [], null, false, {
      label: response.userMessage,
      tone: "blocked",
    });
  }

  return buildAppViewModelFromParts(response.document, [], buildDiagnosticPanelViewModel(response.diagnostics), true);
}

export function buildAppViewModelFromRecoverResponse(
  fallbackDocument: MonthlyScheduleDocument,
  response: RecoverScheduleResponse,
): AppViewModel {
  if (!response.ok) {
    return buildAppViewModelFromParts(fallbackDocument, [], null, false, {
      label: response.userMessage,
      tone: "blocked",
    });
  }

  return buildAppViewModelFromParts(response.document, [], buildDiagnosticPanelViewModel(response.diagnostics), true, {
    label: response.diffs.length ? `急休リカバリーを反映しました（変更 ${response.diffs.length}件）` : "急休リカバリーを反映しました",
    tone: "ready",
  });
}

function buildAppViewModelFromParts(
  document: MonthlyScheduleDocument,
  validationIssues: ValidationIssue[],
  diagnostics: DiagnosticPanelViewModel | null,
  valid: boolean,
  statusOverride?: AppStatusViewModel,
): AppViewModel {
  const hasErrors = validationIssues.some((issue) => issue.severity === "error");
  const hasWarnings = validationIssues.some((issue) => issue.severity === "warning");
  const status =
    statusOverride ||
    (hasErrors
      ? { label: "入力内容に修正が必要です", tone: "blocked" as const }
      : hasWarnings
        ? { label: "入力内容に確認事項があります", tone: "warning" as const }
        : diagnostics
          ? { label: diagnostics.result.label, tone: diagnostics.result.severity === "blocked" ? "blocked" as const : "ready" as const }
          : { label: "作成できます", tone: "ready" as const });

  return {
    title: "勤務表作成",
    status,
    documentJson: JSON.stringify(document, null, 2),
    staffTsv: renderStaffTsv(document),
    requestsTsv: renderRequestsTsv(document),
    urgentLeaveTsv: renderUrgentLeaveTsv(),
    scheduleTsv: renderScheduleTsv(document),
    settings: {
      year: document.year,
      month: document.month,
      requirements: {
        early: document.requirements.early,
        day: document.requirements.day,
        late: document.requirements.late,
        night: document.requirements.night,
      },
    },
    schedule: buildScheduleTableViewModel(document),
    diagnostics,
    validationIssues,
    actions: buildActions(valid && !hasErrors, diagnostics),
  };
}

function buildActions(canSolve: boolean, diagnostics: DiagnosticPanelViewModel | null): AppActionViewModel[] {
  const canExport = Boolean(diagnostics && diagnostics.result.severity !== "blocked");
  return [
    {
      id: "validate",
      label: "入力確認",
      enabled: true,
    },
    {
      id: "solve",
      label: "勤務表作成",
      enabled: canSolve,
    },
    {
      id: "recover",
      label: "急休リカバリー",
      enabled: canSolve,
    },
    {
      id: "save",
      label: "保存",
      enabled: canSolve,
    },
    {
      id: "load",
      label: "読込",
      enabled: true,
    },
    {
      id: "backup",
      label: "バックアップ",
      enabled: canSolve,
    },
    {
      id: "applySettings",
      label: "設定反映",
      enabled: true,
    },
    {
      id: "applyStaffTsv",
      label: "職員反映",
      enabled: true,
    },
    {
      id: "exportStaffTsv",
      label: "職員TSV出力",
      enabled: true,
    },
    {
      id: "applyRequestsTsv",
      label: "希望反映",
      enabled: true,
    },
    {
      id: "exportRequestsTsv",
      label: "希望TSV出力",
      enabled: true,
    },
    {
      id: "applyScheduleTsv",
      label: "勤務表反映",
      enabled: true,
    },
    {
      id: "exportScheduleTsv",
      label: "勤務表TSV出力",
      enabled: true,
    },
    {
      id: "applyJson",
      label: "JSON反映",
      enabled: true,
    },
    {
      id: "exportJson",
      label: "JSON出力",
      enabled: true,
    },
    {
      id: "exportExcel",
      label: "Excel出力",
      enabled: canExport,
    },
    {
      id: "exportPdf",
      label: "PDF出力",
      enabled: canExport,
    },
    {
      id: "quit",
      label: "終了",
      enabled: true,
    },
  ];
}
