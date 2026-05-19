import type { MonthlyScheduleDocument, ScheduleRow, ShiftCode } from "./domain";

const SHIFT_VALUES = new Set<string>(["早", "日", "遅", "夜", "明", "公", "休", "有", "特", "欠", "出張", "産休", "育休", ""]);

export function renderScheduleTsv(document: MonthlyScheduleDocument): string {
  const days = Array.from({ length: daysInMonth(document.year, document.month) }, (_, index) => String(index + 1));
  const rows = [
    ["職種", "氏名", ...days].join("\t"),
    ...document.staff.map((staff) => {
      const schedule = findScheduleRow(document, staff.id, staff.name);
      const shifts = normalizeShifts(schedule?.shifts || [], days.length);
      return [staff.role, staff.name, ...shifts].join("\t");
    }),
  ];
  return `${rows.join("\n")}\n`;
}

export function applyScheduleTsv(document: MonthlyScheduleDocument, tsv: string): MonthlyScheduleDocument {
  const lines = tsv
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
  const rows = lines.map((line) => line.split("\t"));
  const bodyRows = rows[0]?.[0] === "職種" || rows[0]?.[1] === "氏名" ? rows.slice(1) : rows;
  const days = daysInMonth(document.year, document.month);
  const staffByName = new Map(document.staff.map((staff) => [staff.name, staff]));
  const existingByStaffId = new Map(document.schedule.map((row) => [row.staffId, row]));
  const nextSchedule = new Map<string, ScheduleRow>();

  bodyRows.forEach((row) => {
    const role = String(row[0] || "");
    const name = String(row[1] || "");
    if (!name) return;
    const staff = staffByName.get(name);
    if (!staff) return;
    nextSchedule.set(staff.id, {
      staffId: staff.id,
      role: role || staff.role,
      name: staff.name,
      shifts: normalizeShifts(row.slice(2), days),
    });
  });

  document.staff.forEach((staff) => {
    if (!nextSchedule.has(staff.id)) {
      const existing = existingByStaffId.get(staff.id);
      nextSchedule.set(staff.id, {
        staffId: staff.id,
        role: existing?.role || staff.role,
        name: staff.name,
        shifts: normalizeShifts(existing?.shifts || [], days),
      });
    }
  });

  return {
    ...document,
    schedule: document.staff.map((staff) => nextSchedule.get(staff.id)!),
    diagnostics: null,
  };
}

function findScheduleRow(document: MonthlyScheduleDocument, staffId: string, name: string): ScheduleRow | undefined {
  return document.schedule.find((row) => row.staffId === staffId) || document.schedule.find((row) => row.name === name);
}

function normalizeShifts(values: string[], days: number): ShiftCode[] {
  return Array.from({ length: days }, (_, index) => normalizeShift(values[index]));
}

function normalizeShift(value: string | undefined): ShiftCode {
  const trimmed = String(value || "").trim();
  return (SHIFT_VALUES.has(trimmed) ? trimmed : "") as ShiftCode;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}
