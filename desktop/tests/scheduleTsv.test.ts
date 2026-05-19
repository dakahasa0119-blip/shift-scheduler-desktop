import { applyScheduleTsv, renderScheduleTsv } from "../core/scheduleTsv";
import { sampleMonthlyScheduleDocument } from "../core/fixtures";

function main(): void {
  const tsv = renderScheduleTsv(sampleMonthlyScheduleDocument);
  assertIncludes(tsv, "職種\t氏名\t1\t2\t3", "header");
  assertIncludes(tsv, "介護リーダー\t江藤\t早\t夜\t明", "eto row");

  const changed = applyScheduleTsv(
    sampleMonthlyScheduleDocument,
    [
      "職種\t氏名\t1\t2\t3\t4\t5\t6",
      "介護リーダー\t江藤\t日\t日\t公\t公\t早\t遅",
      "介護\t有山\t早\t早\t遅\t公\t日\t日",
      "",
    ].join("\n"),
  );
  assertEqual(changed.schedule[0].shifts[0], "日", "changed eto day 1");
  assertEqual(changed.schedule[0].shifts.length, 30, "normalized days");
  assertEqual(changed.diagnostics, null, "diagnostics reset");

  const ignoredUnknown = applyScheduleTsv(sampleMonthlyScheduleDocument, "介護\t存在しない\t日\n");
  assertEqual(ignoredUnknown.schedule.length, sampleMonthlyScheduleDocument.staff.length, "unknown staff ignored");
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertIncludes(text: string, expected: string, label: string): void {
  if (!text.includes(expected)) {
    throw new Error(`${label}: missing ${expected}`);
  }
}

main();
