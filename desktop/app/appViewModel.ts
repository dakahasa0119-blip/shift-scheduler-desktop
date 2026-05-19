import type { RecoverScheduleResponse, SolveScheduleResponse, ValidateScheduleResponse } from "../api/contracts";
import type { CapacitySimulationPayload, MonthlyScheduleDocument } from "../core/domain";
import { validateMonthlyScheduleDocument, type ValidationIssue } from "../core/validation";
import { renderScheduleTsv } from "../core/scheduleTsv";
import { renderRequestsTsv, renderStaffTsv } from "../core/inputTsv";
import { renderUrgentLeaveTsv } from "../core/recoveryTsv";
import { renderActualScheduleTsv, renderChangeHistoryTsv, renderUrgentLeaveHistoryTsv } from "../core/operationalRecords";
import { renderSolverInputJson } from "../core/solverJsonExchange";
import { staffDropdownOptions } from "../core/initialSetup";
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
  actualScheduleTsv: string;
  changeHistoryTsv: string;
  urgentLeaveHistoryTsv: string;
  capacitySimulationJson: string;
  solverInputJson: string;
  solverTimeLimitSeconds: number;
  capacitySimulation: CapacitySimulationViewModel | null;
  operation: OperationStateViewModel;
  staffDropdowns: typeof staffDropdownOptions;
  plannedLeaveCancelOptions: AppSelectOptionViewModel[];
  urgentLeaveCancelOptions: AppSelectOptionViewModel[];
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
    allowedShortageShifts: string;
    femaleRequiredWeekdays: string;
  };
}

export interface AppStatusViewModel {
  label: string;
  tone: "ready" | "working" | "warning" | "blocked";
}

export interface AppSelectOptionViewModel {
  value: string;
  label: string;
}

export interface OperationStateViewModel {
  currentOperationYearMonth: string;
  currentTargetYearMonth: string;
  lastArchivedYearMonth: string;
  archiveCount: number;
}

export interface CapacitySimulationViewModel {
  generatedAt: string;
  summaries: CapacitySimulationPayload["planSummaries"];
  results: CapacitySimulationPayload["results"];
}

export interface AppActionViewModel {
  id:
    | "validate"
    | "monthlyPrecheck"
    | "runMonthlyTransition"
    | "archiveCurrentMonth"
    | "startNextMonthPlanning"
    | "promoteOperationMonth"
    | "repairCalendar"
    | "setupInitialSettings"
    | "normalizeStaffColumns"
    | "fixDropdownLists"
    | "checkSolverConnection"
    | "importSolverOutputJson"
    | "exportSolverInputJson"
    | "postEditRecheck"
    | "solve"
    | "createActual"
    | "addLeaveRequest"
    | "cancelPlannedLeave"
    | "cancelUrgentLeave"
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
    | "applyActualScheduleTsv"
    | "exportActualScheduleTsv"
    | "ensureHistory"
    | "exportChangeHistoryTsv"
    | "exportUrgentLeaveHistoryTsv"
    | "exportAiDebugJson"
    | "runCapacitySimulation"
    | "refreshCapacitySimulation"
    | "importCapacitySimulationJson"
    | "exportCapacitySimulationJson"
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
    actualScheduleTsv: renderActualScheduleTsv(document),
    changeHistoryTsv: renderChangeHistoryTsv(document),
    urgentLeaveHistoryTsv: renderUrgentLeaveHistoryTsv(document),
    capacitySimulationJson: `${JSON.stringify(document.capacitySimulation || null, null, 2)}\n`,
    solverInputJson: renderSolverInputJson(document),
    solverTimeLimitSeconds: 240,
    capacitySimulation: document.capacitySimulation
      ? {
          generatedAt: document.capacitySimulation.generatedAt,
          summaries: document.capacitySimulation.planSummaries,
          results: document.capacitySimulation.results,
        }
      : null,
    operation: {
      currentOperationYearMonth: document.operation?.currentOperationYearMonth || `${document.year}-${String(document.month).padStart(2, "0")}`,
      currentTargetYearMonth: document.operation?.currentTargetYearMonth || nextYearMonth(document.year, document.month),
      lastArchivedYearMonth: document.operation?.lastArchivedYearMonth || "",
      archiveCount: document.operation?.archives.length || 0,
    },
    staffDropdowns: staffDropdownOptions,
    plannedLeaveCancelOptions: buildPlannedLeaveCancelOptions(document),
    urgentLeaveCancelOptions: buildUrgentLeaveCancelOptions(document),
    settings: {
      year: document.year,
      month: document.month,
      requirements: {
        early: document.requirements.early,
        day: document.requirements.day,
        late: document.requirements.late,
        night: document.requirements.night,
        allowedShortageShifts: document.requirements.allowedShortageShifts.join(","),
        femaleRequiredWeekdays: document.requirements.femaleRequiredWeekdays.join(","),
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
      id: "monthlyPrecheck",
      label: "月次切替前チェック",
      enabled: true,
    },
    {
      id: "runMonthlyTransition",
      label: "月次切替まとめて実行",
      enabled: true,
    },
    {
      id: "archiveCurrentMonth",
      label: "月次アーカイブ",
      enabled: true,
    },
    {
      id: "startNextMonthPlanning",
      label: "次月勤務表作成",
      enabled: true,
    },
    {
      id: "promoteOperationMonth",
      label: "運用月更新",
      enabled: true,
    },
    {
      id: "repairCalendar",
      label: "勤務表カレンダー修復",
      enabled: true,
    },
    {
      id: "setupInitialSettings",
      label: "初期設定を実行",
      enabled: true,
    },
    {
      id: "normalizeStaffColumns",
      label: "職員列を整える",
      enabled: true,
    },
    {
      id: "fixDropdownLists",
      label: "プルダウン修復",
      enabled: true,
    },
    {
      id: "checkSolverConnection",
      label: "Solver接続確認",
      enabled: true,
    },
    {
      id: "importSolverOutputJson",
      label: "Solver結果取り込み",
      enabled: true,
    },
    {
      id: "exportSolverInputJson",
      label: "Solver入力JSON出力",
      enabled: true,
    },
    {
      id: "postEditRecheck",
      label: "手修正後の再判定",
      enabled: true,
    },
    {
      id: "solve",
      label: "勤務表作成",
      enabled: canSolve,
    },
    {
      id: "createActual",
      label: "勤務実績作成",
      enabled: canSolve,
    },
    {
      id: "addLeaveRequest",
      label: "休暇・希望を登録",
      enabled: canSolve,
    },
    {
      id: "cancelPlannedLeave",
      label: "事前休暇を取り消し",
      enabled: true,
    },
    {
      id: "cancelUrgentLeave",
      label: "急遽休を取り消し",
      enabled: true,
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
      id: "applyActualScheduleTsv",
      label: "実績反映",
      enabled: true,
    },
    {
      id: "exportActualScheduleTsv",
      label: "実績TSV出力",
      enabled: true,
    },
    {
      id: "ensureHistory",
      label: "変更履歴を確認",
      enabled: true,
    },
    {
      id: "exportChangeHistoryTsv",
      label: "変更履歴TSV出力",
      enabled: true,
    },
    {
      id: "exportUrgentLeaveHistoryTsv",
      label: "急休履歴TSV出力",
      enabled: true,
    },
    {
      id: "exportAiDebugJson",
      label: "AI向け出力",
      enabled: true,
    },
    {
      id: "runCapacitySimulation",
      label: "体制シミュレーション再計算",
      enabled: true,
    },
    {
      id: "refreshCapacitySimulation",
      label: "体制表示を更新",
      enabled: true,
    },
    {
      id: "importCapacitySimulationJson",
      label: "体制JSON取り込み",
      enabled: true,
    },
    {
      id: "exportCapacitySimulationJson",
      label: "体制JSON出力",
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

function nextYearMonth(year: number, month: number): string {
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
}

function buildPlannedLeaveCancelOptions(document: MonthlyScheduleDocument): AppSelectOptionViewModel[] {
  const staffById = new Map(document.staff.map((staff) => [staff.id, staff.name]));
  return document.requests
    .map((request, index) => ({ request, index }))
    .filter(({ request }) => request.type !== "当日急遽休")
    .reverse()
    .map(({ request, index }) => {
      const staffName = staffById.get(request.staffId) || request.staffId;
      const range = request.startDate === request.endDate ? request.startDate : `${request.startDate} - ${request.endDate}`;
      const notes = request.notes ? ` / ${request.notes}` : "";
      return {
        value: String(index),
        label: `${range} / ${staffName} / ${request.type}${notes}`,
      };
    });
}

function buildUrgentLeaveCancelOptions(document: MonthlyScheduleDocument): AppSelectOptionViewModel[] {
  return (document.urgentLeaveHistory || [])
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => !entry.canceled)
    .reverse()
    .map(({ entry, index }) => ({
      value: String(index),
      label: `${entry.date} / ${entry.staffName} / 元:${entry.originalShift || "空欄"} -> ${entry.changedTo || ""}`,
    }));
}
