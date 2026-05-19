import type { ChangeHistoryEntry, MonthlyScheduleDocument, RequestType, ScheduleRow, ShiftCode } from "./domain";

const historyHeader = ["区分", "休暇種別", "スタッフ名", "日付", "変更前", "変更後", "備考", "実行日時"];
const urgentHistoryHeader = ["スタッフ名", "日付", "元シフト", "変更後", "備考", "記録日時", "取消済"];

export interface LeaveRequestInput {
  staffName?: string;
  type?: string;
  startDate?: string;
  endDate?: string;
  notes?: string;
}

export interface CancelByIndexInput {
  index?: number | string;
}

export function createOrRefreshActualSchedule(document: MonthlyScheduleDocument, now: Date = new Date()): MonthlyScheduleDocument {
  const actualSchedule = cloneScheduleRows(document.schedule.length ? document.schedule : document.staff.map((staff) => ({
    staffId: staff.id,
    role: staff.role,
    name: staff.name,
    shifts: [],
  })));
  return appendChangeHistory({
    ...document,
    actualSchedule,
    diagnostics: null,
  }, {
    category: "勤務実績作成",
    leaveType: "",
    staffName: "",
    date: `${document.year}-${pad(document.month)}`,
    beforeValue: "",
    afterValue: `${actualSchedule.length}名`,
    notes: "勤務表から勤務実績を作成 / 更新",
    executedAt: now.toISOString(),
  });
}

export function ensureChangeHistory(document: MonthlyScheduleDocument): MonthlyScheduleDocument {
  return {
    ...document,
    changeHistory: document.changeHistory || [],
  };
}

export function addLeaveRequest(document: MonthlyScheduleDocument, input: LeaveRequestInput, now: Date = new Date()): MonthlyScheduleDocument {
  const staffName = clean(input.staffName);
  const staff = document.staff.find((item) => item.name === staffName);
  if (!staff) throw new Error("スタッフ名がありません。");
  const type = normalizeRequestType(input.type);
  const startDate = normalizeDate(input.startDate, document.year, document.month);
  const endDate = normalizeDate(input.endDate || input.startDate, document.year, document.month);
  if (!startDate) throw new Error("開始日がありません。");
  const notes = clean(input.notes);
  const request = {
    id: `request-${Date.now()}`,
    staffId: staff.id,
    type,
    startDate,
    endDate: endDate || startDate,
    notes,
  };
  let next: MonthlyScheduleDocument = {
    ...document,
    requests: [...document.requests, request],
    diagnostics: null,
  };
  next = appendChangeHistory(next, {
    category: "休暇登録",
    leaveType: type,
    staffName,
    date: startDate,
    beforeValue: "",
    afterValue: mapLeaveTypeToShift(type),
    notes,
    executedAt: now.toISOString(),
  });
  if (type === "当日急遽休") {
    next = markUrgentLeaveToActual(next, staffName, startDate, notes, now);
  }
  return next;
}

export function markUrgentLeaveToActual(
  document: MonthlyScheduleDocument,
  staffName: string,
  date: string,
  notes: string,
  now: Date = new Date(),
): MonthlyScheduleDocument {
  if (!document.actualSchedule) {
    throw new Error("勤務実績がありません。先に勤務実績を作成 / 更新してください。");
  }
  const dayIndex = dayIndexInMonth(date, document.year, document.month);
  if (dayIndex < 0) return document;
  const actualSchedule = cloneScheduleRows(document.actualSchedule);
  const row = actualSchedule.find((item) => item.name === staffName);
  if (!row) return document;
  const beforeValue = row.shifts[dayIndex] || "";
  if (beforeValue === "公") return document;
  row.shifts[dayIndex] = "公";
  const urgentLeaveHistory = [
    ...(document.urgentLeaveHistory || []),
    {
      staffName,
      date,
      originalShift: beforeValue,
      changedTo: "公" as ShiftCode,
      notes,
      createdAt: now.toISOString(),
      canceled: false,
    },
  ];
  return appendChangeHistory({
    ...document,
    actualSchedule,
    urgentLeaveHistory,
    diagnostics: null,
  }, {
    category: "急遽休登録",
    leaveType: "当日急遽休",
    staffName,
    date,
    beforeValue,
    afterValue: "公",
    notes,
    executedAt: now.toISOString(),
  });
}

export function cancelPlannedLeaveRequest(
  document: MonthlyScheduleDocument,
  input: CancelByIndexInput,
  now: Date = new Date(),
): MonthlyScheduleDocument {
  const index = normalizeIndex(input.index);
  const request = document.requests[index];
  if (!request) throw new Error("取消対象が不正です。");
  if (request.type === "当日急遽休") throw new Error("当日急遽休は急休取消で取り消してください。");
  const staff = document.staff.find((item) => item.id === request.staffId);
  const staffName = staff?.name || request.staffId;
  const requests = document.requests.filter((_, itemIndex) => itemIndex !== index);
  return appendChangeHistory({
    ...document,
    requests,
    diagnostics: null,
  }, {
    category: "事前休暇取消",
    leaveType: request.type,
    staffName,
    date: request.startDate,
    beforeValue: mapLeaveTypeToShift(request.type),
    afterValue: "",
    notes: request.notes || "取消",
    executedAt: now.toISOString(),
  });
}

export function cancelUrgentLeave(
  document: MonthlyScheduleDocument,
  input: CancelByIndexInput,
  now: Date = new Date(),
): MonthlyScheduleDocument {
  const index = normalizeIndex(input.index);
  const entry = document.urgentLeaveHistory?.[index];
  if (!entry) throw new Error("取消対象が不正です。");
  if (entry.canceled) throw new Error("この急遽休はすでに取り消し済みです。");
  if (!document.actualSchedule) throw new Error("勤務実績がありません。");
  const dayIndex = dayIndexInMonth(entry.date, document.year, document.month);
  if (dayIndex < 0) throw new Error("指定日が勤務実績の対象月ではありません。");
  const actualSchedule = cloneScheduleRows(document.actualSchedule);
  const row = actualSchedule.find((item) => item.name === entry.staffName);
  if (!row) throw new Error("勤務実績上に該当スタッフが見つかりません。");
  const beforeValue = row.shifts[dayIndex] || entry.changedTo || "公";
  row.shifts[dayIndex] = entry.originalShift || "";
  const urgentLeaveHistory = (document.urgentLeaveHistory || []).map((item, itemIndex) => (
    itemIndex === index ? { ...item, canceled: true } : item
  ));
  return appendChangeHistory({
    ...document,
    actualSchedule,
    urgentLeaveHistory,
    diagnostics: null,
  }, {
    category: "急遽休取消",
    leaveType: "当日急遽休",
    staffName: entry.staffName,
    date: entry.date,
    beforeValue,
    afterValue: entry.originalShift || "",
    notes: entry.notes || "取消",
    executedAt: now.toISOString(),
  });
}

export function renderActualScheduleTsv(document: MonthlyScheduleDocument): string {
  return renderScheduleRowsTsv(document, document.actualSchedule || []);
}

export function applyActualScheduleTsv(document: MonthlyScheduleDocument, tsv: string, now: Date = new Date()): MonthlyScheduleDocument {
  const actualSchedule = parseScheduleRowsTsv(document, tsv);
  return appendChangeHistory({
    ...document,
    actualSchedule,
    diagnostics: null,
  }, {
    category: "勤務実績反映",
    leaveType: "",
    staffName: "",
    date: `${document.year}-${pad(document.month)}`,
    beforeValue: "",
    afterValue: `${actualSchedule.length}名`,
    notes: "勤務実績TSVを反映",
    executedAt: now.toISOString(),
  });
}

export function renderChangeHistoryTsv(document: MonthlyScheduleDocument): string {
  return [
    historyHeader.join("\t"),
    ...(document.changeHistory || []).map((entry) => [
      entry.category,
      entry.leaveType,
      entry.staffName,
      entry.date,
      entry.beforeValue,
      entry.afterValue,
      entry.notes,
      entry.executedAt,
    ].join("\t")),
  ].join("\n");
}

export function renderUrgentLeaveHistoryTsv(document: MonthlyScheduleDocument): string {
  return [
    urgentHistoryHeader.join("\t"),
    ...(document.urgentLeaveHistory || []).map((entry) => [
      entry.staffName,
      entry.date,
      entry.originalShift,
      entry.changedTo,
      entry.notes,
      entry.createdAt,
      entry.canceled ? "取消済" : "",
    ].join("\t")),
  ].join("\n");
}

export function appendChangeHistory(document: MonthlyScheduleDocument, entry: ChangeHistoryEntry): MonthlyScheduleDocument {
  return {
    ...document,
    changeHistory: [...(document.changeHistory || []), entry],
  };
}

function renderScheduleRowsTsv(document: MonthlyScheduleDocument, rows: ScheduleRow[]): string {
  const days = daysInMonth(document.year, document.month);
  const rowsByStaffId = new Map(rows.map((row) => [row.staffId, row]));
  return [
    ["職種", "氏名", ...Array.from({ length: days }, (_, index) => String(index + 1))].join("\t"),
    ...document.staff.map((staff) => {
      const row = rowsByStaffId.get(staff.id) || rows.find((item) => item.name === staff.name);
      return [staff.role, staff.name, ...normalizeShifts(row?.shifts || [], days)].join("\t");
    }),
  ].join("\n");
}

function parseScheduleRowsTsv(document: MonthlyScheduleDocument, tsv: string): ScheduleRow[] {
  const lines = tsv.split(/\r?\n/).map((line) => line.trimEnd()).filter((line) => line.trim());
  const rows = lines.map((line) => line.split("\t"));
  const bodyRows = rows[0]?.[0] === "職種" || rows[0]?.[1] === "氏名" ? rows.slice(1) : rows;
  const days = daysInMonth(document.year, document.month);
  const staffByName = new Map(document.staff.map((staff) => [staff.name, staff]));
  return bodyRows.flatMap((row) => {
    const name = String(row[1] || "").trim();
    const staff = staffByName.get(name);
    if (!staff) return [];
    return [{
      staffId: staff.id,
      role: String(row[0] || staff.role),
      name: staff.name,
      shifts: normalizeShifts(row.slice(2), days),
    }];
  });
}

function cloneScheduleRows(rows: ScheduleRow[]): ScheduleRow[] {
  return rows.map((row) => ({
    ...row,
    shifts: row.shifts.slice(),
  }));
}

function normalizeShifts(values: string[], days: number): ShiftCode[] {
  return Array.from({ length: days }, (_, index) => normalizeShift(values[index]));
}

function normalizeShift(value: string | undefined): ShiftCode {
  const trimmed = String(value || "").trim();
  if (trimmed === "早" || trimmed === "日" || trimmed === "遅" || trimmed === "夜" || trimmed === "明" || trimmed === "公" || trimmed === "休" || trimmed === "有" || trimmed === "特" || trimmed === "欠" || trimmed === "出張" || trimmed === "産休" || trimmed === "育休") {
    return trimmed;
  }
  return "";
}

function normalizeRequestType(value: string | undefined): RequestType {
  const type = clean(value);
  if (type === "希望早出" || type === "希望日勤" || type === "希望遅出" || type === "希望夜勤" || type === "事前希望休" || type === "有給" || type === "特別休" || type === "当日急遽休" || type === "当日特別休" || type === "出張" || type === "産休" || type === "育休" || type === "休職" || type === "長期病欠" || type === "入職前" || type === "退職後" || type === "供給除外") {
    return type;
  }
  return "事前希望休";
}

function mapLeaveTypeToShift(type: RequestType): ShiftCode {
  if (type === "有給") return "有";
  if (type === "特別休" || type === "当日特別休") return "特";
  if (type === "希望夜勤") return "夜";
  if (type === "希望早出") return "早";
  if (type === "希望遅出") return "遅";
  if (type === "希望日勤") return "日";
  if (type === "出張") return "出張";
  if (type === "産休") return "産休";
  if (type === "育休") return "育休";
  if (type === "休職") return "休";
  if (type === "長期病欠") return "欠";
  if (type === "入職前" || type === "退職後" || type === "供給除外") return "";
  return "公";
}

function normalizeDate(value: string | undefined, year: number, month: number): string {
  const text = clean(value);
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const day = Number(text.replace(/日$/, ""));
  if (Number.isInteger(day) && day >= 1 && day <= daysInMonth(year, month)) {
    return `${year}-${pad(month)}-${pad(day)}`;
  }
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
  }
  return "";
}

function dayIndexInMonth(date: string, year: number, month: number): number {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return -1;
  if (parsed.getFullYear() !== year || parsed.getMonth() + 1 !== month) return -1;
  return parsed.getDate() - 1;
}

function normalizeIndex(value: number | string | undefined): number {
  const index = Number(value);
  if (!Number.isInteger(index) || index < 0) return -1;
  return index;
}

function clean(value: string | undefined): string {
  return String(value || "").trim();
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
