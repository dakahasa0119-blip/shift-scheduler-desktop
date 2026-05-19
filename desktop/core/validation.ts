import type { MonthlyScheduleDocument } from "./domain";

export interface ValidationIssue {
  path: string;
  message: string;
  severity: "error" | "warning";
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

export function validateMonthlyScheduleDocument(document: MonthlyScheduleDocument): ValidationResult {
  const issues: ValidationIssue[] = [];
  const staffIds = new Set<string>();
  const staffNames = new Set<string>();

  if (document.schemaVersion !== "desktop-shift-schedule/v1") {
    issues.push(error("schemaVersion", "未対応のデータ形式です"));
  }
  if (!Number.isInteger(document.year) || document.year < 2000 || document.year > 2100) {
    issues.push(error("year", "年が不正です"));
  }
  if (!Number.isInteger(document.month) || document.month < 1 || document.month > 12) {
    issues.push(error("month", "月が不正です"));
  }

  document.staff.forEach((staff, index) => {
    const base = `staff[${index}]`;
    if (!staff.id) issues.push(error(`${base}.id`, "職員IDが空です"));
    if (!staff.name) issues.push(error(`${base}.name`, "職員名が空です"));
    if (staff.id && staffIds.has(staff.id)) issues.push(error(`${base}.id`, "職員IDが重複しています"));
    if (staff.name && staffNames.has(staff.name)) issues.push(error(`${base}.name`, "職員名が重複しています"));
    if (!staff.allowedShifts.length) issues.push(error(`${base}.allowedShifts`, "勤務可能シフトが空です"));
    if (!staff.allowedWeekdays.length) issues.push(warn(`${base}.allowedWeekdays`, "勤務可能曜日が空です"));
    if (staff.fixedOffWeekday != null && (staff.fixedOffWeekday < 0 || staff.fixedOffWeekday > 6)) {
      issues.push(error(`${base}.fixedOffWeekday`, "固定休曜日が不正です"));
    }
    staffIds.add(staff.id);
    staffNames.add(staff.name);
  });

  document.requests.forEach((request, index) => {
    const base = `requests[${index}]`;
    if (!request.id) issues.push(error(`${base}.id`, "希望・休暇IDが空です"));
    if (!staffIds.has(request.staffId)) issues.push(error(`${base}.staffId`, "存在しない職員IDです"));
    if (!isIsoDate(request.startDate)) issues.push(error(`${base}.startDate`, "開始日が不正です"));
    if (!isIsoDate(request.endDate)) issues.push(error(`${base}.endDate`, "終了日が不正です"));
    if (isIsoDate(request.startDate) && isIsoDate(request.endDate) && request.endDate < request.startDate) {
      issues.push(error(`${base}.endDate`, "終了日が開始日より前です"));
    }
  });

  if (document.requirements.early < 0) issues.push(error("requirements.early", "早番必要数が不正です"));
  if (document.requirements.day < 0) issues.push(error("requirements.day", "日勤必要数が不正です"));
  if (document.requirements.late < 0) issues.push(error("requirements.late", "遅番必要数が不正です"));
  if (document.requirements.night < 0) issues.push(error("requirements.night", "夜勤必要数が不正です"));

  Object.entries(document.previousMonthTail).forEach(([staffId, tail]) => {
    if (!staffIds.has(staffId)) issues.push(error(`previousMonthTail.${staffId}`, "存在しない職員IDです"));
    if (tail.length > 7) issues.push(warn(`previousMonthTail.${staffId}`, "前月末引き継ぎは最大7日分に丸められます"));
  });

  document.schedule.forEach((row, index) => {
    const base = `schedule[${index}]`;
    if (!staffIds.has(row.staffId)) issues.push(error(`${base}.staffId`, "存在しない職員IDです"));
    if (!row.name) issues.push(error(`${base}.name`, "勤務表行の名前が空です"));
  });

  return {
    ok: issues.every((issue) => issue.severity !== "error"),
    issues,
  };
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function error(path: string, message: string): ValidationIssue {
  return { path, message, severity: "error" };
}

function warn(path: string, message: string): ValidationIssue {
  return { path, message, severity: "warning" };
}
