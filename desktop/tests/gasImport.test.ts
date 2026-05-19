import { convertGasSolverInputToDocument, isGasSolverInputPayload } from "../core/gasImport";
import type { SolverInputPayload } from "../core/solverInput";

function main(): void {
  const payload: SolverInputPayload = {
    schemaVersion: "gas-shift-solver-input/v1",
    generatedAt: "2026-05-20 09:00:00",
    source: "desktop",
    targetYear: 2026,
    targetMonth: 6,
    daysInMonth: 30,
    requiredShiftStaffing: {
      "早": 1,
      "日": 0,
      "遅": 1,
      "夜": 1,
    },
    requiredCoreShiftTypes: ["早", "遅", "夜"],
    optionalShiftTypes: ["日"],
    femaleRequiredWeekdays: [1, 2, 3, 4, 5],
    allowedShortagePolicy: {
      allowedShortageShifts: ["遅"],
    },
    staffConditions: [
      {
        staffType: "介護リーダー",
        name: "江藤",
        condition: "月3回",
        allowedShift: "早・日・遅・夜",
        monday: true,
        tuesday: true,
        wednesday: true,
        thursday: true,
        friday: true,
        saturday: true,
        sunday: true,
        fixedOff: "",
        gender: "男性",
      },
    ],
    leaveEntries: [
      {
        name: "江藤",
        type: "事前希望休",
        date: "6/6",
        notes: "私用",
      },
    ],
    supplyExclusions: [],
    previousMonthTailByName: {
      "江藤": ["遅", "夜", "明", "公", "夜", "明", "早"],
    },
    currentSchedule: [
      {
        role: "介護リーダー",
        name: "江藤",
        shifts: ["早", "夜", "明", "公", "早", "公"],
      },
    ],
  };

  assertEqual(isGasSolverInputPayload(payload), true, "is gas payload");
  const document = convertGasSolverInputToDocument(payload);
  assertEqual(document.schemaVersion, "desktop-shift-schedule/v1", "schema");
  assertEqual(document.year, 2026, "year");
  assertEqual(document.month, 6, "month");
  assertEqual(document.requirements.late, 1, "late requirement");
  assertEqual(document.requirements.day, 0, "day requirement");
  assertEqual(document.requirements.allowedShortageShifts[0], "遅", "allowed shortage");
  assertEqual(document.staff[0].name, "江藤", "staff name");
  assertEqual(document.staff[0].role, "介護リーダー", "staff role");
  assertEqual(document.staff[0].monthlyNightTarget, 3, "night target");
  assertEqual(document.requests[0].startDate, "2026-06-06", "request date");
  assertEqual(document.requests[0].notes, "私用", "request notes");
  assertEqual(document.previousMonthTail[document.staff[0].id].length, 7, "previous tail");
  assertEqual(document.schedule[0].shifts.length, 30, "schedule days padded");
  assertEqual(document.schedule[0].shifts[1], "夜", "schedule shift");
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

main();
