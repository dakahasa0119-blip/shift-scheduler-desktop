import type {
  CoreRequiredShiftCode,
  MonthlyScheduleDocument,
  RequestType,
  ShiftCode,
  StaffMember,
  StaffRequest,
} from "./domain";
import type { SolverInputPayload, SolverLeaveEntry, SolverScheduleRow, SolverStaffCondition } from "./solverInput";

export function isGasSolverInputPayload(value: unknown): value is SolverInputPayload {
  return Boolean(extractGasSolverInputPayload(value));
}

export function extractGasSolverInputPayload(value: unknown): SolverInputPayload | null {
  if (isRawGasSolverInputPayload(value)) return value;
  if (value && typeof value === "object") {
    const result = (value as { result?: unknown }).result;
    if (isRawGasSolverInputPayload(result)) return result;
    const payload = (value as { payload?: unknown }).payload;
    if (isRawGasSolverInputPayload(payload)) return payload;
    const inputPayload = (value as { inputPayload?: unknown }).inputPayload;
    if (isRawGasSolverInputPayload(inputPayload)) return inputPayload;
  }
  return null;
}

function isRawGasSolverInputPayload(value: unknown): value is SolverInputPayload {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as { schemaVersion?: unknown }).schemaVersion === "gas-shift-solver-input/v1",
  );
}

export function convertGasSolverInputToDocument(payload: SolverInputPayload): MonthlyScheduleDocument {
  const year = Number(payload.targetYear);
  const month = Number(payload.targetMonth);
  const staff = (payload.staffConditions || []).map((condition, index) => convertStaff(condition, index));
  const staffByName = new Map(staff.map((member) => [member.name, member]));
  const scheduleByName = new Map((payload.currentSchedule || []).map((row) => [row.name, row]));
  const daysInMonth = Number(payload.daysInMonth) || new Date(year, month, 0).getDate();

  return {
    schemaVersion: "desktop-shift-schedule/v1",
    year,
    month,
    staff,
    requests: convertRequests(payload.leaveEntries || [], staffByName, year, month),
    requirements: {
      early: requiredCount(payload.requiredShiftStaffing, "早"),
      day: requiredCount(payload.requiredShiftStaffing, "日"),
      late: requiredCount(payload.requiredShiftStaffing, "遅"),
      night: requiredCount(payload.requiredShiftStaffing, "夜"),
      allowedShortageShifts: ((payload.allowedShortagePolicy || {}).allowedShortageShifts || []).filter(isCoreShift),
      femaleRequiredWeekdays: (payload.femaleRequiredWeekdays || []).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
    },
    previousMonthTail: mapPreviousTail(payload.previousMonthTailByName || {}, staffByName),
    schedule: staff.map((member) => convertScheduleRow(member, scheduleByName.get(member.name), daysInMonth)),
    diagnostics: null,
  };
}

function convertStaff(condition: SolverStaffCondition, index: number): StaffMember {
  return {
    id: stableStaffId(condition.name, index),
    name: clean(condition.name) || `職員${index + 1}`,
    role: clean(condition.staffType) || "介護",
    gender: normalizeGender(condition.gender),
    employmentType: "",
    allowedShifts: parseAllowedShifts(condition.allowedShift),
    allowedWeekdays: parseAllowedWeekdays(condition),
    fixedOffWeekday: parseFixedOffWeekday(condition.fixedOff),
    monthlyNightTarget: parseMonthlyNightTarget(condition.condition),
    monthlyNightMin: null,
    monthlyNightMax: null,
    monthlyWorkLimitDays: null,
    publicHolidayTargetDays: null,
    weeklyWorkLimitDays: null,
    weeklyNightLimit: null,
    activeFrom: null,
    activeTo: null,
    notes: clean(condition.condition) === "なし" ? "" : clean(condition.condition),
  };
}

function convertRequests(
  leaveEntries: SolverLeaveEntry[],
  staffByName: Map<string, StaffMember>,
  year: number,
  month: number,
): StaffRequest[] {
  return leaveEntries
    .map((entry, index) => {
      const staff = staffByName.get(clean(entry.name));
      const date = normalizeGasDate(entry.date, year, month);
      if (!staff || !date) return null;
      return {
        id: `request-${index + 1}`,
        staffId: staff.id,
        type: normalizeRequestType(entry.type),
        startDate: date,
        endDate: date,
        notes: clean(entry.notes),
      } satisfies StaffRequest;
    })
    .filter((entry): entry is StaffRequest => Boolean(entry));
}

function convertScheduleRow(staff: StaffMember, row: SolverScheduleRow | undefined, daysInMonth: number) {
  const shifts = ((row && row.shifts) || []).slice(0, daysInMonth).map(normalizeShift);
  while (shifts.length < daysInMonth) shifts.push("");
  return {
    staffId: staff.id,
    role: staff.role,
    name: staff.name,
    shifts,
  };
}

function mapPreviousTail(previousTailByName: Record<string, ShiftCode[]>, staffByName: Map<string, StaffMember>): Record<string, ShiftCode[]> {
  const out: Record<string, ShiftCode[]> = {};
  Object.entries(previousTailByName).forEach(([name, tail]) => {
    const staff = staffByName.get(clean(name));
    if (!staff) return;
    out[staff.id] = (tail || []).slice(-7).map(normalizeShift);
  });
  return out;
}

function parseAllowedShifts(value: string): CoreRequiredShiftCode[] {
  const shifts = clean(value)
    .split(/[・,、\s]+/)
    .filter(isCoreShift);
  return shifts.length ? shifts : ["早", "日", "遅", "夜"];
}

function parseAllowedWeekdays(condition: SolverStaffCondition): number[] {
  const weekdays: number[] = [];
  if (condition.sunday) weekdays.push(0);
  if (condition.monday) weekdays.push(1);
  if (condition.tuesday) weekdays.push(2);
  if (condition.wednesday) weekdays.push(3);
  if (condition.thursday) weekdays.push(4);
  if (condition.friday) weekdays.push(5);
  if (condition.saturday) weekdays.push(6);
  return weekdays.length ? weekdays : [0, 1, 2, 3, 4, 5, 6];
}

function parseFixedOffWeekday(value: string): number | null {
  const text = clean(value);
  const labels = ["日", "月", "火", "水", "木", "金", "土"];
  const index = labels.findIndex((label) => text.includes(label));
  return index >= 0 ? index : null;
}

function parseMonthlyNightTarget(value: string): number | null {
  const match = /月\s*(\d+)\s*回/.exec(clean(value));
  return match ? Number(match[1]) : null;
}

function normalizeGasDate(value: string, year: number, month: number): string | null {
  const text = clean(value);
  const slash = /^(\d{1,2})\/(\d{1,2})$/.exec(text);
  if (slash) {
    const entryMonth = Number(slash[1]);
    const day = Number(slash[2]);
    if (entryMonth !== month || day < 1 || day > new Date(year, month, 0).getDate()) return null;
    return `${year}-${pad(month)}-${pad(day)}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return null;
}

function normalizeRequestType(value: RequestType): RequestType {
  return value || "事前希望休";
}

function normalizeGender(value: string): StaffMember["gender"] {
  const gender = clean(value);
  return gender === "男性" || gender === "女性" ? gender : "";
}

function normalizeShift(value: string): ShiftCode {
  const shift = clean(value);
  if (
    shift === "早" ||
    shift === "日" ||
    shift === "遅" ||
    shift === "夜" ||
    shift === "明" ||
    shift === "公" ||
    shift === "休" ||
    shift === "有" ||
    shift === "特" ||
    shift === "欠" ||
    shift === "出張" ||
    shift === "産休" ||
    shift === "育休" ||
    shift === ""
  ) {
    return shift;
  }
  return "";
}

function requiredCount(staffing: Record<CoreRequiredShiftCode, number>, shift: CoreRequiredShiftCode): number {
  const value = Number((staffing || {})[shift]);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function stableStaffId(name: string, index: number): string {
  const ascii = clean(name)
    .replace(/\s+/g, "-")
    .replace(/[^\w-]/g, "");
  return ascii ? `staff-${ascii}` : `staff-${index + 1}`;
}

function isCoreShift(value: string): value is CoreRequiredShiftCode {
  return value === "早" || value === "日" || value === "遅" || value === "夜";
}

function clean(value: string | undefined): string {
  return String(value || "").trim();
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
