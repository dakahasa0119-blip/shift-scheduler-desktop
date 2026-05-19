import { parseUrgentLeaveTsv, renderUrgentLeaveTsv } from "../core/recoveryTsv";
import { sampleMonthlyScheduleDocument } from "../core/fixtures";

function main(): void {
  assertIncludes(renderUrgentLeaveTsv(), "氏名\t日付\t理由\t備考", "urgent leave header");

  const parsed = parseUrgentLeaveTsv(
    "氏名\t日付\t理由\t備考\n江藤\t6/5\t急休\t発熱\n有山\t6\t欠勤\t連絡あり\n",
    sampleMonthlyScheduleDocument.staff,
    2026,
    6,
  );
  assertEqual(parsed.length, 2, "urgent leave count");
  assertEqual(parsed[0].staffId, "staff_eto", "staff id");
  assertEqual(parsed[0].date, "2026-06-05", "date from month/day");
  assertEqual(parsed[0].reason, "急休", "reason");
  assertEqual(parsed[1].date, "2026-06-06", "date from day");
  assertEqual(parsed[1].reason, "欠勤", "second reason");
}

function assertIncludes(text: string, expected: string, label: string): void {
  if (!text.includes(expected)) {
    throw new Error(`${label}: missing ${expected}`);
  }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

main();
