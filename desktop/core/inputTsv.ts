import type { MonthlyScheduleDocument, StaffMember, StaffRequest, RequestType, CoreRequiredShiftCode } from "./domain";

const staffHeader = [
  "氏名",
  "職種",
  "性別",
  "雇用",
  "可能勤務",
  "可能曜日",
  "固定休",
  "夜勤目標",
  "夜勤下限",
  "夜勤上限",
  "月勤務上限",
  "公休目標",
  "週勤務上限",
  "週夜勤上限",
  "入職日",
  "退職日",
  "備考",
];

const requestHeader = ["氏名", "区分", "開始日", "終了日", "備考"];

export function renderStaffTsv(document: MonthlyScheduleDocument): string {
  return [
    staffHeader.join("\t"),
    ...document.staff.map((staff) =>
      [
        staff.name,
        staff.role,
        staff.gender || "",
        staff.employmentType || "",
        staff.allowedShifts.join(","),
        staff.allowedWeekdays.join(","),
        staff.fixedOffWeekday ?? "",
        staff.monthlyNightTarget ?? "",
        staff.monthlyNightMin ?? "",
        staff.monthlyNightMax ?? "",
        staff.monthlyWorkLimitDays ?? "",
        staff.publicHolidayTargetDays ?? "",
        staff.weeklyWorkLimitDays ?? "",
        staff.weeklyNightLimit ?? "",
        staff.activeFrom || "",
        staff.activeTo || "",
        staff.notes || "",
      ].join("\t"),
    ),
  ].join("\n");
}

export function renderRequestsTsv(document: MonthlyScheduleDocument): string {
  const staffById = new Map(document.staff.map((staff) => [staff.id, staff.name]));
  return [
    requestHeader.join("\t"),
    ...document.requests.map((request) =>
      [
        staffById.get(request.staffId) || request.staffId,
        request.type,
        request.startDate,
        request.endDate,
        request.notes || "",
      ].join("\t"),
    ),
  ].join("\n");
}

export function applyStaffTsv(document: MonthlyScheduleDocument, tsv: string): MonthlyScheduleDocument {
  const rows = parseTsv(tsv);
  const bodyRows = isHeader(rows[0], staffHeader) ? rows.slice(1) : rows;
  const existingByName = new Map(document.staff.map((staff) => [staff.name, staff]));
  const staff = bodyRows
    .filter((row) => row.some((cell) => cell.trim()))
    .map((row, index) => normalizeStaffRow(row, existingByName, index));
  return {
    ...document,
    staff,
    schedule: staff.map((staffMember) => {
      const existing = document.schedule.find((row) => row.staffId === staffMember.id || row.name === staffMember.name);
      return {
        staffId: staffMember.id,
        role: staffMember.role,
        name: staffMember.name,
        shifts: existing?.shifts.slice() || [],
      };
    }),
    requests: document.requests.filter((request) => staff.some((staffMember) => staffMember.id === request.staffId)),
    diagnostics: null,
  };
}

export function applyRequestsTsv(document: MonthlyScheduleDocument, tsv: string): MonthlyScheduleDocument {
  const rows = parseTsv(tsv);
  const bodyRows = isHeader(rows[0], requestHeader) ? rows.slice(1) : rows;
  const staffByName = new Map(document.staff.map((staff) => [staff.name, staff]));
  const requests = bodyRows
    .filter((row) => row.some((cell) => cell.trim()))
    .map((row, index) => normalizeRequestRow(row, staffByName, index))
    .filter((request): request is StaffRequest => Boolean(request));
  return {
    ...document,
    requests,
    diagnostics: null,
  };
}

function normalizeStaffRow(row: string[], existingByName: Map<string, StaffMember>, index: number): StaffMember {
  const name = clean(row[0]);
  const existing = existingByName.get(name);
  return {
    id: existing?.id || `staff-${index + 1}`,
    name,
    role: clean(row[1]) || existing?.role || "介護",
    gender: (clean(row[2]) as StaffMember["gender"]) || "",
    employmentType: (clean(row[3]) as StaffMember["employmentType"]) || "",
    allowedShifts: parseShifts(row[4], existing?.allowedShifts || ["早", "日", "遅", "夜"]),
    allowedWeekdays: parseNumbers(row[5], existing?.allowedWeekdays || [0, 1, 2, 3, 4, 5, 6]),
    fixedOffWeekday: nullableNumber(row[6], existing?.fixedOffWeekday ?? null),
    monthlyNightTarget: nullableNumber(row[7], existing?.monthlyNightTarget ?? null),
    monthlyNightMin: nullableNumber(row[8], existing?.monthlyNightMin ?? null),
    monthlyNightMax: nullableNumber(row[9], existing?.monthlyNightMax ?? null),
    monthlyWorkLimitDays: nullableNumber(row[10], existing?.monthlyWorkLimitDays ?? null),
    publicHolidayTargetDays: nullableNumber(row[11], existing?.publicHolidayTargetDays ?? null),
    weeklyWorkLimitDays: nullableNumber(row[12], existing?.weeklyWorkLimitDays ?? null),
    weeklyNightLimit: nullableNumber(row[13], existing?.weeklyNightLimit ?? null),
    activeFrom: clean(row[14]) || null,
    activeTo: clean(row[15]) || null,
    notes: clean(row[16]) || "",
  };
}

function normalizeRequestRow(row: string[], staffByName: Map<string, StaffMember>, index: number): StaffRequest | null {
  const staff = staffByName.get(clean(row[0]));
  if (!staff) return null;
  const startDate = clean(row[2]);
  return {
    id: `request-${index + 1}`,
    staffId: staff.id,
    type: normalizeRequestType(row[1]),
    startDate,
    endDate: clean(row[3]) || startDate,
    notes: clean(row[4]) || "",
  };
}

function parseTsv(tsv: string): string[][] {
  return tsv.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").map((line) => line.split("\t"));
}

function isHeader(row: string[] | undefined, header: string[]): boolean {
  return Boolean(row && header.every((value, index) => clean(row[index]) === value));
}

function clean(value: string | undefined): string {
  return (value || "").trim();
}

function parseShifts(value: string | undefined, fallback: CoreRequiredShiftCode[]): CoreRequiredShiftCode[] {
  const shifts = clean(value).split(/[,\s、・]+/).filter((item): item is CoreRequiredShiftCode =>
    item === "早" || item === "日" || item === "遅" || item === "夜",
  );
  return shifts.length ? shifts : fallback;
}

function parseNumbers(value: string | undefined, fallback: number[]): number[] {
  const weekdayMap: Record<string, number> = { "日": 0, "月": 1, "火": 2, "水": 3, "木": 4, "金": 5, "土": 6 };
  const numbers = clean(value).split(/[,\s、・]+/).map((item) => {
    if (Object.prototype.hasOwnProperty.call(weekdayMap, item)) return weekdayMap[item];
    return Number(item);
  }).filter((item) => Number.isInteger(item) && item >= 0 && item <= 6);
  return numbers.length ? numbers : fallback;
}

function nullableNumber(value: string | undefined, fallback: number | null): number | null {
  const numberValue = Number(clean(value));
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function normalizeRequestType(value: string | undefined): RequestType {
  const type = clean(value);
  if (
    type === "希望早出" ||
    type === "希望日勤" ||
    type === "希望遅出" ||
    type === "希望夜勤" ||
    type === "事前希望休" ||
    type === "有給" ||
    type === "特別休" ||
    type === "当日急遽休" ||
    type === "当日特別休" ||
    type === "出張" ||
    type === "産休" ||
    type === "育休" ||
    type === "休職" ||
    type === "長期病欠" ||
    type === "入職前" ||
    type === "退職後" ||
    type === "供給除外"
  ) {
    return type;
  }
  return "事前希望休";
}
