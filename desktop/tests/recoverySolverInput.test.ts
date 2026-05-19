import { sampleMonthlyScheduleDocument } from "../core/fixtures";
import { buildSolverInputPayload } from "../core/solverInput";

function main(): void {
  const payload = buildSolverInputPayload(sampleMonthlyScheduleDocument, "2026-05-20 10:00:00", {
    fixedThroughDate: "2026-06-04",
    urgentLeaves: [
      {
        staffId: "staff_eto",
        date: "2026-06-05",
        reason: "急休",
        notes: "発熱",
      },
    ],
  });

  assertEqual(payload.recovery?.enabled, true, "recovery enabled");
  assertEqual(payload.recovery?.fixedThroughDay, 4, "fixed through day");
  assertEqual(payload.recovery?.urgentLeaves.length, 1, "urgent leave count");
  assertEqual(payload.recovery?.urgentLeaves[0].name, "江藤", "urgent leave name");
  assertEqual(payload.recovery?.urgentLeaves[0].date, "6/5", "solver date");
  assertEqual(payload.recovery?.urgentLeaves[0].originalShift, "早", "original shift");
  assertEqual(payload.currentSchedule[0].role, "介護リーダー", "current role");
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

main();
