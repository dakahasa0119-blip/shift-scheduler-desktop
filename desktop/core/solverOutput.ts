import type {
  MonthlyScheduleDocument,
  ScheduleDiagnostics,
  ScheduleRow,
  ShiftCode,
  StaffMember,
  UnmetRequestDiagnostic,
} from "./domain";
import { HARD_LEAVE_TYPES, REQUESTED_WORK_TYPES } from "./domain";
import { buildUserFacingDiagnosticMessages } from "./diagnosticMessages";

export interface SolverOutputScheduleRow {
  role?: string;
  name: string;
  shifts: ShiftCode[];
}

export interface SolverOutputPayload {
  schemaVersion?: "gas-shift-solver-output/v1";
  targetYear: number;
  targetMonth: number;
  daysInMonth: number;
  status: string;
  schedule: SolverOutputScheduleRow[];
  diagnostics?: SolverOutputDiagnostics;
  apiDiagnostics?: SolverOutputDiagnostics;
}

export interface SolverOutputDiagnostics {
  deploymentReadiness?: SolverDeploymentReadiness;
  manualCorrectionHints?: SolverManualCorrectionHint[];
  requestDiagnostics?: {
    unmetRequests?: SolverUnmetRequest[];
  };
  objectiveValue?: number;
  shortageCount?: number;
  fallback?: string;
  reason?: string;
}

export interface SolverDeploymentReadiness {
  isProductionSafe?: boolean;
  hardViolationCount?: number;
  shortageCount?: number;
  toleratedShortageCount?: number;
  blockingShortageCount?: number;
  unmetLeaveRequestCount?: number;
  unmetShiftRequestCount?: number;
  operationalShortageReasons?: SolverOperationalShortageReason[];
  blockers?: string[];
  advisories?: string[];
}

export interface SolverOperationalShortageReason {
  date: string;
  shift: "早" | "日" | "遅" | "夜";
  candidateCount?: number;
  topBlockedReasons?: string[];
}

export interface SolverUnmetRequest {
  date: string;
  name: string;
  type: string;
  assignedShift?: ShiftCode;
}

export interface SolverManualCorrectionHint {
  issueType?: string;
  priority?: "最優先" | "高" | "中" | "低";
  date?: string;
  shift?: string;
  targetStaff?: string;
  suggestedAction?: string;
  candidateSummary?: string;
  recommendedCandidatesText?: string;
  redistributionCandidatesText?: string;
  remainingShortageSummary?: string;
}

export function applySolverOutputToDocument(
  document: MonthlyScheduleDocument,
  output: SolverOutputPayload,
): MonthlyScheduleDocument {
  const staffByName = new Map(document.staff.map((staff) => [staff.name, staff]));
  const schedule = output.schedule.map((row) => toScheduleRow(row, staffByName));
  const diagnostics = buildScheduleDiagnostics(document, output);

  return {
    ...document,
    year: output.targetYear || document.year,
    month: output.targetMonth || document.month,
    schedule,
    diagnostics,
  };
}

export function buildScheduleDiagnostics(
  document: MonthlyScheduleDocument,
  output: SolverOutputPayload,
): ScheduleDiagnostics {
  const rawDiagnostics = output.diagnostics || output.apiDiagnostics || {};
  const readiness = rawDiagnostics.deploymentReadiness || {};
  const unmetRequests = normalizeUnmetRequests(document, rawDiagnostics.requestDiagnostics?.unmetRequests || []);
  const shortages = (readiness.operationalShortageReasons || []).map((item) => ({
    date: item.date,
    shift: item.shift,
    count: 1,
    allowed: document.requirements.allowedShortageShifts.includes(item.shift),
    reasons: (item.topBlockedReasons || []).map(localizeShortageReason),
  }));
  const suggestions = (rawDiagnostics.manualCorrectionHints || []).slice(0, 5).map((item) => ({
    type: item.issueType || "manual_correction",
    priority: item.priority || "高",
    target: [item.date, item.shift].filter(Boolean).join(" "),
    message: item.suggestedAction || "勤務配置を調整してください",
    remainingIssueSummary:
      item.remainingShortageSummary ||
      item.redistributionCandidatesText ||
      item.recommendedCandidatesText ||
      item.candidateSummary ||
      "",
  }));

  const hardViolationCount = Number(readiness.hardViolationCount || 0);
  const blockingShortageCount = Number(readiness.blockingShortageCount || 0);
  const allowedShortageCount = Number(readiness.toleratedShortageCount || 0);
  const unmetLeaveRequestCount =
    Number(readiness.unmetLeaveRequestCount || 0) ||
    unmetRequests.filter((item) => item.blocking).length;
  const unmetShiftRequestCount =
    Number(readiness.unmetShiftRequestCount || 0) ||
    unmetRequests.filter((item) => !item.blocking).length;
  const canUse =
    output.status === "OPTIMAL" || output.status === "FEASIBLE"
      ? hardViolationCount === 0 && blockingShortageCount === 0 && unmetLeaveRequestCount === 0
      : false;

  const diagnostics: ScheduleDiagnostics = {
    status: canUse
      ? allowedShortageCount > 0 || unmetShiftRequestCount > 0
        ? "ok_with_notes"
        : "ok"
      : "blocked",
    summary: {
      canUse,
      requiredFixCount: hardViolationCount,
      allowedShortageCount,
      blockingShortageCount,
      unmetLeaveRequestCount,
      unmetShiftRequestCount,
    },
    messages: [],
    shortages,
    unmetRequests,
    suggestions,
  };
  diagnostics.messages = buildUserFacingDiagnosticMessages(diagnostics);
  return diagnostics;
}

function toScheduleRow(row: SolverOutputScheduleRow, staffByName: Map<string, StaffMember>): ScheduleRow {
  const staff = staffByName.get(row.name);
  return {
    staffId: staff?.id || `unmatched:${row.name}`,
    role: staff?.role || row.role || "",
    name: row.name,
    shifts: row.shifts.slice(),
  };
}

function normalizeUnmetRequests(
  document: MonthlyScheduleDocument,
  requests: SolverUnmetRequest[],
): UnmetRequestDiagnostic[] {
  const staffByName = new Map(document.staff.map((staff) => [staff.name, staff]));
  return requests.map((item) => {
    const staff = staffByName.get(item.name);
    const blocking = HARD_LEAVE_TYPES.includes(item.type as never) && !REQUESTED_WORK_TYPES.includes(item.type as never);
    return {
      date: item.date,
      staffId: staff?.id || `unmatched:${item.name}`,
      name: item.name,
      type: item.type as never,
      assignedShift: item.assignedShift || "",
      blocking,
    };
  });
}

function localizeShortageReason(reason: string): string {
  const text = String(reason || "");
  const countMatch = text.match(/x\d+$/);
  const countText = countMatch ? countMatch[0] : "";
  const base = text.replace(/x\d+$/, "");
  const map: Record<string, string> = {
    "月間上限": "月の勤務上限",
    "週次上限": "週の勤務上限",
    "当日他シフト": "同じ日に別勤務",
    "希望休/休暇": "休暇希望",
    "前月引き継ぎ": "前月からの夜勤明け",
    "非許可シフト": "担当できない勤務",
    "曜日制限": "勤務できない曜日",
    "固定休": "固定休",
    "供給除外": "出張・休職など",
    "公休余力なし": "公休数の余力なし",
    "夜勤明け": "夜勤明け",
  };
  return (map[base] || base || text) + countText;
}
