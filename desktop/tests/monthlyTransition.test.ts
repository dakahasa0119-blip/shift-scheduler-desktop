import { sampleMonthlyScheduleDocument } from "../core/fixtures";
import { initializeOperationMonths, runMonthlyTransition, startNextMonthPlanning } from "../core/monthlyTransition";

function main(): void {
  const initialized = initializeOperationMonths(sampleMonthlyScheduleDocument);
  const planned = startNextMonthPlanning(initialized, new Date("2026-05-20T00:00:00Z")).document;

  assertEqual(planned.year, 2026, "planned year");
  assertEqual(planned.month, 7, "planned month");
  assertEqual(planned.requests.length, 0, "next month requests cleared");
  assertEqual(planned.previousMonthTail.staff_eto.join(","), "早,夜,明,公,早,公", "previous tail from current schedule");
  assertEqual(planned.schedule[0].shifts.length, 0, "next schedule starts empty");

  const transitioned = runMonthlyTransition(initialized, new Date("2026-05-20T00:00:00Z")).document;
  assertEqual(transitioned.operation?.lastArchivedYearMonth, "2026-06", "archive month");
  assertEqual(transitioned.operation?.currentOperationYearMonth, "2026-07", "operation month");
  assertEqual(transitioned.operation?.currentTargetYearMonth, "2026-08", "target month");
  assertEqual(transitioned.requests.length, 0, "transition requests cleared");
  assertEqual(transitioned.operation?.archives[0].schedule[0].shifts[0], "早", "archive keeps current schedule");
  assertEqual(transitioned.operation?.archives[0].requests.length, 2, "archive keeps current requests");
  assertEqual(transitioned.previousMonthTail.staff_eto.at(-1), "公", "transition keeps previous tail");
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

main();
