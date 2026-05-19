import type { MonthlyScheduleDocument, RequestType, ScheduleRow, ShiftCode, StaffMember } from "../core/domain";
import { HARD_LEAVE_TYPES, REQUESTED_WORK_TYPES, SUPPLY_EXCLUSION_TYPES } from "../core/domain";

export type ScheduleCellTone =
  | "empty"
  | "work"
  | "night"
  | "afterNight"
  | "off"
  | "leave"
  | "supplyExclusion"
  | "requestMatched"
  | "requestUnmet";

export interface ScheduleTableViewModel {
  title: string;
  days: ScheduleDayHeaderViewModel[];
  rows: ScheduleStaffRowViewModel[];
}

export interface ScheduleDayHeaderViewModel {
  day: number;
  date: string;
  weekday: string;
  weekend: boolean;
}

export interface ScheduleStaffRowViewModel {
  staffId: string;
  role: string;
  name: string;
  cells: ScheduleCellViewModel[];
}

export interface ScheduleCellViewModel {
  date: string;
  shift: ShiftCode;
  tone: ScheduleCellTone;
  requestLabel: string;
  note: string;
}

interface RequestOnDate {
  type: RequestType;
  notes: string;
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export function buildScheduleTableViewModel(document: MonthlyScheduleDocument): ScheduleTableViewModel {
  const days = buildDays(document.year, document.month);
  const scheduleByStaffId = new Map(document.schedule.map((row) => [row.staffId, row]));
  const scheduleByName = new Map(document.schedule.map((row) => [row.name, row]));
  const requestsByStaffAndDate = buildRequestMap(document);

  return {
    title: `${document.year}年${document.month}月 勤務表`,
    days,
    rows: document.staff.map((staff) => {
      const scheduleRow = scheduleByStaffId.get(staff.id) || scheduleByName.get(staff.name);
      return buildStaffRow(staff, scheduleRow, days, requestsByStaffAndDate);
    }),
  };
}

function buildStaffRow(
  staff: StaffMember,
  scheduleRow: ScheduleRow | undefined,
  days: ScheduleDayHeaderViewModel[],
  requestsByStaffAndDate: Map<string, RequestOnDate[]>,
): ScheduleStaffRowViewModel {
  return {
    staffId: staff.id,
    role: String(scheduleRow?.role || staff.role || ""),
    name: scheduleRow?.name || staff.name,
    cells: days.map((day, index) => {
      const shift = scheduleRow?.shifts[index] || "";
      const requests = requestsByStaffAndDate.get(`${staff.id}|${day.date}`) || [];
      return buildCell(day.date, shift, requests);
    }),
  };
}

function buildCell(date: string, shift: ShiftCode, requests: RequestOnDate[]): ScheduleCellViewModel {
  const primaryRequest = requests[0];
  const requestLabel = requests.map((request) => request.type).join(" / ");
  const note = requests.map((request) => request.notes).filter(Boolean).join(" / ");
  return {
    date,
    shift,
    tone: resolveTone(shift, primaryRequest?.type),
    requestLabel,
    note,
  };
}

function resolveTone(shift: ShiftCode, requestType: RequestType | undefined): ScheduleCellTone {
  if (requestType) {
    if (SUPPLY_EXCLUSION_TYPES.includes(requestType)) {
      return isSupplyExclusionShift(shift) ? "supplyExclusion" : "requestUnmet";
    }
    if (HARD_LEAVE_TYPES.includes(requestType)) {
      return isLeaveShift(shift) ? "requestMatched" : "requestUnmet";
    }
    if (REQUESTED_WORK_TYPES.includes(requestType)) {
      return requestedShiftMatches(requestType, shift) ? "requestMatched" : "requestUnmet";
    }
  }

  if (shift === "") return "empty";
  if (shift === "夜") return "night";
  if (shift === "明") return "afterNight";
  if (shift === "公") return "off";
  if (shift === "休" || shift === "有" || shift === "特" || shift === "欠") return "leave";
  if (isSupplyExclusionShift(shift)) return "supplyExclusion";
  return "work";
}

function requestedShiftMatches(requestType: RequestType, shift: ShiftCode): boolean {
  const map: Record<string, ShiftCode> = {
    "希望早出": "早",
    "希望日勤": "日",
    "希望遅出": "遅",
    "希望夜勤": "夜",
  };
  return map[requestType] === shift;
}

function isLeaveShift(shift: ShiftCode): boolean {
  return shift === "公" || shift === "休" || shift === "有" || shift === "特";
}

function isSupplyExclusionShift(shift: ShiftCode): boolean {
  return shift === "出張" || shift === "産休" || shift === "育休" || shift === "";
}

function buildRequestMap(document: MonthlyScheduleDocument): Map<string, RequestOnDate[]> {
  const map = new Map<string, RequestOnDate[]>();
  document.requests.forEach((request) => {
    enumerateDates(request.startDate, request.endDate).forEach((date) => {
      const key = `${request.staffId}|${date}`;
      const existing = map.get(key) || [];
      existing.push({
        type: request.type,
        notes: request.notes,
      });
      map.set(key, existing);
    });
  });
  return map;
}

function buildDays(year: number, month: number): ScheduleDayHeaderViewModel[] {
  const daysInMonth = new Date(year, month, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const date = formatDate(year, month, day);
    const weekdayIndex = new Date(year, month - 1, day).getDay();
    return {
      day,
      date,
      weekday: WEEKDAYS[weekdayIndex],
      weekend: weekdayIndex === 0 || weekdayIndex === 6,
    };
  });
}

function enumerateDates(startDate: string, endDate: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return [];
  const dates: string[] = [];
  const current = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  while (current <= end) {
    dates.push(formatDate(current.getFullYear(), current.getMonth() + 1, current.getDate()));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function formatDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
