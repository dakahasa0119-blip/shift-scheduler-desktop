import type {
  CoreRequiredShiftCode,
  MonthlyScheduleDocument,
  RequestType,
  ShiftCode,
  StaffMember,
} from "./domain";
import { SUPPLY_EXCLUSION_TYPES } from "./domain";

export interface SolverStaffCondition {
  staffType: string;
  name: string;
  condition: string;
  allowedShift: string;
  monday: boolean | string;
  tuesday: boolean | string;
  wednesday: boolean | string;
  thursday: boolean | string;
  friday: boolean | string;
  saturday: boolean | string;
  sunday: boolean | string;
  fixedOff: string;
  gender: string;
}

export interface SolverLeaveEntry {
  name: string;
  type: RequestType;
  date: string;
  notes: string;
}

export interface SolverSupplyExclusion {
  name: string;
  type: RequestType;
  date?: string;
  startDate?: string;
  endDate?: string;
  notes?: string;
}

export interface SolverScheduleRow {
  role: string;
  name: string;
  shifts: ShiftCode[];
}

export interface SolverRecoveryUrgentLeave {
  name: string;
  date: string;
  originalShift: ShiftCode;
  reason: string;
  notes: string;
}

export interface SolverRecoverySettings {
  enabled: boolean;
  fixedThroughDay?: number;
  urgentLeaves: SolverRecoveryUrgentLeave[];
}

export interface SolverRecoveryInput {
  fixedThroughDate?: string;
  urgentLeaves: {
    staffId: string;
    date: string;
    reason: string;
    notes?: string;
  }[];
}

export interface SolverInputPayload {
  schemaVersion: "gas-shift-solver-input/v1";
  generatedAt: string;
  source: "desktop";
  targetYear: number;
  targetMonth: number;
  daysInMonth: number;
  requiredShiftStaffing: Record<CoreRequiredShiftCode, number>;
  requiredCoreShiftTypes: CoreRequiredShiftCode[];
  optionalShiftTypes: CoreRequiredShiftCode[];
  femaleRequiredWeekdays: number[];
  allowedShortagePolicy: {
    allowedShortageShifts: CoreRequiredShiftCode[];
  };
  staffConditions: SolverStaffCondition[];
  leaveEntries: SolverLeaveEntry[];
  supplyExclusions: SolverSupplyExclusion[];
  previousMonthTailByName: Record<string, ShiftCode[]>;
  currentSchedule: SolverScheduleRow[];
  recovery?: SolverRecoverySettings;
}

export function buildSolverInputPayload(
  document: MonthlyScheduleDocument,
  generatedAt: string,
  recovery?: SolverRecoveryInput,
): SolverInputPayload {
  const daysInMonth = getDaysInMonth(document.year, document.month);
  const staffById = new Map(document.staff.map((staff) => [staff.id, staff]));
  const leaveEntries = expandRequestsToLeaveEntries(document, staffById);

  const payload: SolverInputPayload = {
    schemaVersion: "gas-shift-solver-input/v1",
    generatedAt,
    source: "desktop",
    targetYear: document.year,
    targetMonth: document.month,
    daysInMonth,
    requiredShiftStaffing: {
      "早": document.requirements.early,
      "日": document.requirements.day,
      "遅": document.requirements.late,
      "夜": document.requirements.night,
    },
    requiredCoreShiftTypes: ["早", "日", "遅", "夜"],
    optionalShiftTypes: ["日"],
    femaleRequiredWeekdays: document.requirements.femaleRequiredWeekdays.slice(),
    allowedShortagePolicy: {
      allowedShortageShifts: document.requirements.allowedShortageShifts.slice(),
    },
    staffConditions: document.staff.map(toSolverStaffCondition),
    leaveEntries,
    supplyExclusions: leaveEntries
      .filter((entry) => SUPPLY_EXCLUSION_TYPES.includes(entry.type))
      .map((entry) => ({
        name: entry.name,
        type: entry.type,
        date: entry.date,
        startDate: entry.date,
        endDate: entry.date,
        notes: entry.notes,
      })),
    previousMonthTailByName: mapPreviousTailByName(document, staffById),
    currentSchedule: document.schedule.map((row) => ({
      role: String(row.role || ""),
      name: row.name,
      shifts: row.shifts.slice(0, daysInMonth),
    })),
  };
  const recoverySettings = recovery ? buildRecoverySettings(document, recovery, staffById, daysInMonth) : null;
  if (recoverySettings) payload.recovery = recoverySettings;
  return payload;
}

function buildRecoverySettings(
  document: MonthlyScheduleDocument,
  recovery: SolverRecoveryInput,
  staffById: Map<string, StaffMember>,
  daysInMonth: number,
): SolverRecoverySettings | null {
  const scheduleByStaffId = new Map(document.schedule.map((row) => [row.staffId, row]));
  const urgentLeaves = recovery.urgentLeaves
    .map((entry) => {
      const staff = staffById.get(entry.staffId);
      const day = dayOfTargetMonth(entry.date, document.year, document.month);
      if (!staff || !day || day > daysInMonth) return null;
      const currentRow = scheduleByStaffId.get(entry.staffId);
      return {
        name: staff.name,
        date: `${document.month}/${day}`,
        originalShift: currentRow?.shifts[day - 1] || "",
        reason: entry.reason,
        notes: entry.notes || "",
      } satisfies SolverRecoveryUrgentLeave;
    })
    .filter((entry): entry is SolverRecoveryUrgentLeave => Boolean(entry));

  if (!urgentLeaves.length) return null;
  const fixedThroughDay = dayOfTargetMonth(recovery.fixedThroughDate || "", document.year, document.month);
  return {
    enabled: true,
    fixedThroughDay: fixedThroughDay ? Math.max(0, Math.min(daysInMonth, fixedThroughDay)) : undefined,
    urgentLeaves,
  };
}

function toSolverStaffCondition(staff: StaffMember): SolverStaffCondition {
  const weekdaySet = new Set(staff.allowedWeekdays);
  return {
    staffType: String(staff.role || ""),
    name: staff.name,
    condition: buildConditionText(staff),
    allowedShift: staff.allowedShifts.join("・"),
    sunday: weekdaySet.has(0),
    monday: weekdaySet.has(1),
    tuesday: weekdaySet.has(2),
    wednesday: weekdaySet.has(3),
    thursday: weekdaySet.has(4),
    friday: weekdaySet.has(5),
    saturday: weekdaySet.has(6),
    fixedOff: formatFixedOff(staff.fixedOffWeekday),
    gender: staff.gender || "",
  };
}

function buildConditionText(staff: StaffMember): string {
  const parts: string[] = [];
  if (staff.monthlyNightTarget != null) parts.push(`月${staff.monthlyNightTarget}回`);
  if (staff.notes) parts.push(staff.notes);
  return parts.join(" ") || "なし";
}

function formatFixedOff(weekday: number | null): string {
  const labels = ["毎週日曜", "毎週月曜", "毎週火曜", "毎週水曜", "毎週木曜", "毎週金曜", "毎週土曜"];
  return weekday == null ? "" : labels[weekday] || "";
}

function expandRequestsToLeaveEntries(
  document: MonthlyScheduleDocument,
  staffById: Map<string, StaffMember>,
): SolverLeaveEntry[] {
  const entries: SolverLeaveEntry[] = [];
  document.requests.forEach((request) => {
    const staff = staffById.get(request.staffId);
    if (!staff) return;
    const dates = eachDateInMonth(request.startDate, request.endDate, document.year, document.month);
    dates.forEach((date) => {
      entries.push({
        name: staff.name,
        type: request.type,
        date: `${document.month}/${date.getDate()}`,
        notes: request.notes,
      });
    });
  });
  return dedupeLeaveEntries(entries);
}

function dedupeLeaveEntries(entries: SolverLeaveEntry[]): SolverLeaveEntry[] {
  const seen = new Set<string>();
  const out: SolverLeaveEntry[] = [];
  entries.forEach((entry) => {
    const key = [entry.name, entry.type, entry.date, entry.notes].join("|");
    if (seen.has(key)) return;
    seen.add(key);
    out.push(entry);
  });
  return out;
}

function mapPreviousTailByName(
  document: MonthlyScheduleDocument,
  staffById: Map<string, StaffMember>,
): Record<string, ShiftCode[]> {
  const out: Record<string, ShiftCode[]> = {};
  Object.entries(document.previousMonthTail).forEach(([staffId, tail]) => {
    const staff = staffById.get(staffId);
    if (!staff) return;
    out[staff.name] = tail.slice(-7);
  });
  return out;
}

function eachDateInMonth(startDate: string, endDate: string, year: number, month: number): Date[] {
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate || startDate);
  if (!start || !end || end < start) return [];

  const dates: Date[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (d.getFullYear() === year && d.getMonth() + 1 === month) {
      dates.push(new Date(d));
    }
  }
  return dates;
}

function parseLocalDate(value: string): Date | null {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function dayOfTargetMonth(value: string, year: number, month: number): number | null {
  const date = parseLocalDate(value);
  if (!date || date.getFullYear() !== year || date.getMonth() + 1 !== month) return null;
  return date.getDate();
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}
