import type { StaffMember } from "./domain";

export interface ParsedUrgentLeave {
  staffId: string;
  date: string;
  reason: "急休" | "欠勤" | "その他";
  notes: string;
}

const HEADER = ["氏名", "日付", "理由", "備考"].join("\t");
const REASONS = new Set(["急休", "欠勤", "その他"]);

export function renderUrgentLeaveTsv(): string {
  return `${HEADER}\n`;
}

export function parseUrgentLeaveTsv(
  text: string,
  staff: StaffMember[],
  year: number,
  month: number,
): ParsedUrgentLeave[] {
  const staffByName = new Map(staff.map((item) => [item.name, item]));
  const rows = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim());
  const dataRows = rows[0]?.startsWith("氏名\t") ? rows.slice(1) : rows;
  return dataRows.map((line, index) => {
    const [name, rawDate, rawReason, notes = ""] = line.split("\t");
    const member = staffByName.get(String(name || "").trim());
    if (!member) throw new Error(`急休TSV ${index + 2}行目: 職員名が見つかりません`);
    const date = normalizeDate(rawDate, year, month);
    if (!date) throw new Error(`急休TSV ${index + 2}行目: 日付を確認してください`);
    const reason = normalizeReason(rawReason);
    return {
      staffId: member.id,
      date,
      reason,
      notes: notes.trim(),
    };
  });
}

function normalizeReason(value: string | undefined): ParsedUrgentLeave["reason"] {
  const text = String(value || "急休").trim();
  return REASONS.has(text) ? (text as ParsedUrgentLeave["reason"]) : "その他";
}

function normalizeDate(value: string | undefined, year: number, month: number): string | null {
  const text = String(value || "").trim();
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    const y = Number(match[1]);
    const m = Number(match[2]);
    const d = Number(match[3]);
    return y === year && m === month && isValidDay(y, m, d) ? formatDate(y, m, d) : null;
  }
  match = text.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (match) {
    const m = Number(match[1]);
    const d = Number(match[2]);
    return m === month && isValidDay(year, m, d) ? formatDate(year, m, d) : null;
  }
  match = text.match(/^(\d{1,2})$/);
  if (match) {
    const d = Number(match[1]);
    return isValidDay(year, month, d) ? formatDate(year, month, d) : null;
  }
  return null;
}

function isValidDay(year: number, month: number, day: number): boolean {
  return day >= 1 && day <= new Date(year, month, 0).getDate();
}

function formatDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
