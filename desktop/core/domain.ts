export type ShiftCode =
  | "早"
  | "日"
  | "遅"
  | "夜"
  | "明"
  | "公"
  | "休"
  | "有"
  | "特"
  | "欠"
  | "出張"
  | "産休"
  | "育休"
  | "";

export type WorkShiftCode = "早" | "日" | "遅" | "夜" | "明";
export type CoreRequiredShiftCode = "早" | "日" | "遅" | "夜";

export type StaffRole =
  | "施設長"
  | "介護リーダー"
  | "介護"
  | "夜専"
  | "介護部応援"
  | "看護部応援"
  | "バイト"
  | string;

export type RequestType =
  | "希望早出"
  | "希望日勤"
  | "希望遅出"
  | "希望夜勤"
  | "事前希望休"
  | "有給"
  | "特別休"
  | "当日急遽休"
  | "当日特別休"
  | "出張"
  | "産休"
  | "育休"
  | "休職"
  | "長期病欠"
  | "入職前"
  | "退職後"
  | "供給除外";

export interface StaffMember {
  id: string;
  name: string;
  role: StaffRole;
  gender?: "男性" | "女性" | "";
  employmentType?: "常勤" | "非常勤" | "応援" | "バイト" | "";
  allowedShifts: CoreRequiredShiftCode[];
  allowedWeekdays: number[];
  fixedOffWeekday: number | null;
  monthlyNightTarget: number | null;
  monthlyNightMin: number | null;
  monthlyNightMax: number | null;
  monthlyWorkLimitDays: number | null;
  publicHolidayTargetDays: number | null;
  weeklyWorkLimitDays: number | null;
  weeklyNightLimit: number | null;
  activeFrom: string | null;
  activeTo: string | null;
  notes: string;
}

export interface StaffRequest {
  id: string;
  staffId: string;
  type: RequestType;
  startDate: string;
  endDate: string;
  notes: string;
}

export interface StaffingRequirements {
  early: number;
  day: number;
  late: number;
  night: number;
  allowedShortageShifts: CoreRequiredShiftCode[];
  femaleRequiredWeekdays: number[];
}

export interface ScheduleRow {
  staffId: string;
  role: StaffRole;
  name: string;
  shifts: ShiftCode[];
}

export interface ChangeHistoryEntry {
  category: string;
  leaveType: string;
  staffName: string;
  date: string;
  beforeValue: string;
  afterValue: string;
  notes: string;
  executedAt: string;
}

export interface UrgentLeaveHistoryEntry {
  staffName: string;
  date: string;
  originalShift: ShiftCode;
  changedTo: ShiftCode;
  notes: string;
  createdAt: string;
  canceled: boolean;
}

export interface CapacitySimulationPayload {
  schemaVersion: "capacity-simulation/v1";
  generatedAt: string;
  targetYear: number;
  targetMonth: number;
  caseIds: string[];
  additionalCounts: number[];
  planSummaries: CapacitySimulationPlanSummary[];
  results: CapacitySimulationResult[];
}

export interface CapacitySimulationPlanSummary {
  planId: string;
  planLabel: string;
  requiredShiftStaffing: Record<CoreRequiredShiftCode, number>;
  minimumAdditionalStaff: number | null;
  operationalAdditionalStaff: number | null;
  stableAdditionalStaff: number | null;
  mainBottlenecks: string[];
}

export interface CapacitySimulationResult {
  planId: string;
  planLabel: string;
  caseId: string;
  additionalStaffCount: number;
  classification: "成立困難" | "最低成立" | "運用可能" | "安定目安";
  shortageCount: number;
  metrics: {
    postRestEarly: number;
    lateToRest: number;
    shortNightGap: number;
    sameShiftRun: number;
  };
  bottlenecks: string[];
}

export interface MonthlyArchiveEntry {
  yearMonth: string;
  archivedAt: string;
  schedule: ScheduleRow[];
  actualSchedule: ScheduleRow[];
  changeHistory: ChangeHistoryEntry[];
}

export interface MonthlyOperationState {
  currentOperationYearMonth: string;
  currentTargetYearMonth: string;
  lastArchivedYearMonth: string;
  archives: MonthlyArchiveEntry[];
}

export interface ShortageDiagnostic {
  date: string;
  shift: CoreRequiredShiftCode;
  count: number;
  allowed: boolean;
  reasons: string[];
}

export interface UnmetRequestDiagnostic {
  date: string;
  staffId: string;
  name: string;
  type: RequestType;
  assignedShift: ShiftCode;
  blocking: boolean;
}

export interface CorrectionSuggestion {
  type: string;
  priority: "最優先" | "高" | "中" | "低";
  target: string;
  message: string;
  remainingIssueSummary: string;
}

export interface ScheduleDiagnostics {
  status: "ok" | "ok_with_notes" | "blocked";
  summary: {
    canUse: boolean;
    requiredFixCount: number;
    allowedShortageCount: number;
    blockingShortageCount: number;
    unmetLeaveRequestCount: number;
    unmetShiftRequestCount: number;
  };
  messages: string[];
  shortages: ShortageDiagnostic[];
  unmetRequests: UnmetRequestDiagnostic[];
  suggestions: CorrectionSuggestion[];
}

export interface MonthlyScheduleDocument {
  schemaVersion: "desktop-shift-schedule/v1";
  year: number;
  month: number;
  staff: StaffMember[];
  requests: StaffRequest[];
  requirements: StaffingRequirements;
  previousMonthTail: Record<string, ShiftCode[]>;
  schedule: ScheduleRow[];
  actualSchedule?: ScheduleRow[];
  changeHistory?: ChangeHistoryEntry[];
  urgentLeaveHistory?: UrgentLeaveHistoryEntry[];
  capacitySimulation?: CapacitySimulationPayload | null;
  operation?: MonthlyOperationState;
  diagnostics: ScheduleDiagnostics | null;
}

export const REQUESTED_WORK_TYPES: RequestType[] = [
  "希望早出",
  "希望日勤",
  "希望遅出",
  "希望夜勤",
];

export const HARD_LEAVE_TYPES: RequestType[] = [
  "事前希望休",
  "有給",
  "特別休",
  "当日急遽休",
  "当日特別休",
];

export const SUPPLY_EXCLUSION_TYPES: RequestType[] = [
  "出張",
  "産休",
  "育休",
  "休職",
  "長期病欠",
  "入職前",
  "退職後",
  "供給除外",
];
