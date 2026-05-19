import type {
  CoreRequiredShiftCode,
  MonthlyScheduleDocument,
  ScheduleDiagnostics,
  ShiftCode,
  UnmetRequestDiagnostic,
} from "./domain";
import { HARD_LEAVE_TYPES, REQUESTED_WORK_TYPES } from "./domain";
import { buildUserFacingDiagnosticMessages } from "./diagnosticMessages";

const requiredShifts: CoreRequiredShiftCode[] = ["早", "日", "遅", "夜"];

export function runPostEditRecheck(document: MonthlyScheduleDocument): MonthlyScheduleDocument {
  const diagnostics = buildPostEditDiagnostics(document);
  return {
    ...document,
    diagnostics,
  };
}

export function buildPostEditDiagnostics(document: MonthlyScheduleDocument): ScheduleDiagnostics {
  const shortages = buildShortages(document);
  const unmetRequests = buildUnmetRequests(document);
  const blockingShortageCount = shortages.filter((item) => !item.allowed).length;
  const allowedShortageCount = shortages.filter((item) => item.allowed).length;
  const unmetLeaveRequestCount = unmetRequests.filter((item) => item.blocking).length;
  const unmetShiftRequestCount = unmetRequests.filter((item) => !item.blocking).length;
  const diagnostics: ScheduleDiagnostics = {
    status: blockingShortageCount || unmetLeaveRequestCount ? "blocked" : allowedShortageCount || unmetShiftRequestCount ? "ok_with_notes" : "ok",
    summary: {
      canUse: blockingShortageCount === 0 && unmetLeaveRequestCount === 0,
      requiredFixCount: blockingShortageCount + unmetLeaveRequestCount,
      allowedShortageCount,
      blockingShortageCount,
      unmetLeaveRequestCount,
      unmetShiftRequestCount,
    },
    messages: [],
    shortages,
    unmetRequests,
    suggestions: buildSuggestions(blockingShortageCount, unmetLeaveRequestCount, allowedShortageCount, unmetShiftRequestCount),
  };
  diagnostics.messages = buildUserFacingDiagnosticMessages(diagnostics);
  return diagnostics;
}

function buildShortages(document: MonthlyScheduleDocument): ScheduleDiagnostics["shortages"] {
  const rows = document.schedule || [];
  const days = daysInMonth(document.year, document.month);
  const requirements: Record<CoreRequiredShiftCode, number> = {
    "早": document.requirements.early,
    "日": document.requirements.day,
    "遅": document.requirements.late,
    "夜": document.requirements.night,
  };
  return Array.from({ length: days }).flatMap((_, dayIndex) =>
    requiredShifts.flatMap((shift) => {
      const required = Math.max(0, requirements[shift] || 0);
      const assigned = rows.filter((row) => row.shifts[dayIndex] === shift).length;
      const count = Math.max(0, required - assigned);
      if (!count) return [];
      const allowed = document.requirements.allowedShortageShifts.includes(shift);
      return [{
        date: formatDate(document.year, document.month, dayIndex + 1),
        shift,
        count,
        allowed,
        reasons: [allowed ? "許容不足シフト" : "必要人数未充足"],
      }];
    }),
  );
}

function buildUnmetRequests(document: MonthlyScheduleDocument): UnmetRequestDiagnostic[] {
  const scheduleByStaff = new Map(document.schedule.map((row) => [row.staffId, row]));
  const staffById = new Map(document.staff.map((staff) => [staff.id, staff]));
  return document.requests.flatMap((request) => {
    const row = scheduleByStaff.get(request.staffId);
    const staff = staffById.get(request.staffId);
    const days = expandDateRange(request.startDate, request.endDate);
    return days.flatMap((date) => {
      const dayIndex = dayIndexInMonth(date, document.year, document.month);
      if (dayIndex < 0) return [];
      const assignedShift = row?.shifts[dayIndex] || "";
      if (REQUESTED_WORK_TYPES.includes(request.type)) {
        const expected = requestedWorkShift(request.type);
        return assignedShift === expected ? [] : [unmet(document, date, request.staffId, staff?.name || request.staffId, request.type, assignedShift, false)];
      }
      if (HARD_LEAVE_TYPES.includes(request.type)) {
        const expected = leaveShift(request.type);
        return assignedShift === expected ? [] : [unmet(document, date, request.staffId, staff?.name || request.staffId, request.type, assignedShift, true)];
      }
      return [];
    });
  });
}

function unmet(
  document: MonthlyScheduleDocument,
  date: string,
  staffId: string,
  name: string,
  type: UnmetRequestDiagnostic["type"],
  assignedShift: ShiftCode,
  blocking: boolean,
): UnmetRequestDiagnostic {
  return {
    date: formatDate(document.year, document.month, new Date(`${date}T00:00:00`).getDate()),
    staffId,
    name,
    type,
    assignedShift,
    blocking,
  };
}

function buildSuggestions(
  blockingShortageCount: number,
  unmetLeaveRequestCount: number,
  allowedShortageCount: number,
  unmetShiftRequestCount: number,
): ScheduleDiagnostics["suggestions"] {
  const suggestions: ScheduleDiagnostics["suggestions"] = [];
  if (blockingShortageCount > 0) {
    suggestions.push({
      type: "post_edit_shortage",
      priority: "最優先",
      target: "必要人数不足",
      message: "手修正後に必要人数を下回っています。勤務表作成または手修正で補正してください。",
      remainingIssueSummary: `不足 ${blockingShortageCount}件`,
    });
  }
  if (unmetLeaveRequestCount > 0) {
    suggestions.push({
      type: "post_edit_leave_request",
      priority: "最優先",
      target: "休暇未充足",
      message: "休暇・有給・特別休の指定と勤務表が一致していません。",
      remainingIssueSummary: `休暇未充足 ${unmetLeaveRequestCount}件`,
    });
  }
  if (allowedShortageCount > 0 || unmetShiftRequestCount > 0) {
    suggestions.push({
      type: "post_edit_advisory",
      priority: "中",
      target: "確認事項",
      message: "許容不足または勤務希望未充足があります。配布前に確認してください。",
      remainingIssueSummary: `許容不足 ${allowedShortageCount}件 / 勤務希望未充足 ${unmetShiftRequestCount}件`,
    });
  }
  return suggestions;
}

function requestedWorkShift(type: string): ShiftCode {
  if (type === "希望早出") return "早";
  if (type === "希望日勤") return "日";
  if (type === "希望遅出") return "遅";
  if (type === "希望夜勤") return "夜";
  return "";
}

function leaveShift(type: string): ShiftCode {
  if (type === "有給") return "有";
  if (type === "特別休" || type === "当日特別休") return "特";
  return "公";
}

function expandDateRange(startDate: string, endDate: string): string[] {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${(endDate || startDate)}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];
  const out: string[] = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    out.push(`${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`);
  }
  return out;
}

function dayIndexInMonth(date: string, year: number, month: number): number {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return -1;
  if (parsed.getFullYear() !== year || parsed.getMonth() + 1 !== month) return -1;
  return parsed.getDate() - 1;
}

function formatDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
