import type { MonthlyScheduleDocument, StaffMember } from "../core/domain";
import { buildScheduleTableViewModel } from "../app/scheduleTableViewModel";
import { sampleMonthlyScheduleDocument } from "../core/fixtures";

function main(): void {
  const table = buildScheduleTableViewModel(sampleMonthlyScheduleDocument);
  assertEqual(table.title, "2026年6月 勤務表", "title");
  assertEqual(table.days.length, 30, "days in month");
  assertEqual(table.days[0].weekday, "月", "first weekday");
  assertEqual(table.rows.length, sampleMonthlyScheduleDocument.staff.length, "row count follows staff");
  assertEqual(table.rows[0].role, "介護リーダー", "role");
  assertEqual(table.rows[0].name, "江藤", "name");
  assertEqual(table.rows[0].cells.length, 30, "cell count follows month");
  assertEqual(table.rows[0].cells[5].tone, "requestMatched", "hard leave request matched");
  assertEqual(table.rows[1].cells[5].tone, "requestUnmet", "work request unmet");
  assertEqual(table.rows[1].cells[5].requestLabel, "希望日勤", "request label");

  const expanded = buildScheduleTableViewModel(buildExpandedDocument(20));
  assertEqual(expanded.rows.length, 20, "expanded staff rows");
  assertEqual(expanded.rows[19].name, "追加20", "expanded last staff");
  assertEqual(expanded.rows[19].cells.length, 30, "expanded blank row cells");
  assertEqual(expanded.rows[19].cells[0].shift, "", "expanded blank shift");
  assertEqual(expanded.rows[19].cells[0].tone, "empty", "expanded blank tone");
}

function buildExpandedDocument(staffCount: number): MonthlyScheduleDocument {
  const staff: StaffMember[] = Array.from({ length: staffCount }, (_, index) => ({
    id: `staff_${index + 1}`,
    name: index < 2 ? sampleMonthlyScheduleDocument.staff[index].name : `追加${index + 1}`,
    role: index < 2 ? sampleMonthlyScheduleDocument.staff[index].role : "介護",
    gender: "",
    employmentType: "常勤",
    allowedShifts: ["早", "日", "遅", "夜"],
    allowedWeekdays: [0, 1, 2, 3, 4, 5, 6],
    fixedOffWeekday: null,
    monthlyNightTarget: null,
    monthlyNightMin: null,
    monthlyNightMax: null,
    monthlyWorkLimitDays: null,
    publicHolidayTargetDays: null,
    weeklyWorkLimitDays: null,
    weeklyNightLimit: null,
    activeFrom: null,
    activeTo: null,
    notes: "",
  }));

  return {
    ...sampleMonthlyScheduleDocument,
    staff,
    requests: [],
    schedule: sampleMonthlyScheduleDocument.schedule.map((row, index) => ({
      ...row,
      staffId: staff[index].id,
      name: staff[index].name,
      role: staff[index].role,
    })),
  };
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

main();
