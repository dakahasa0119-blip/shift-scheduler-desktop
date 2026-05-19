import { MockSolverRunner } from "../api/mockSolverRunner";
import { handleSolveSchedule } from "../api/handlers";
import { buildAppViewModelFromSolveResponse, buildInitialAppViewModel } from "../app/appViewModel";
import { sampleMonthlyScheduleDocument } from "../core/fixtures";

async function main(): Promise<void> {
  const initial = buildInitialAppViewModel(sampleMonthlyScheduleDocument);
  assertEqual(initial.title, "勤務表作成", "initial title");
  assertEqual(initial.status.label, "作成できます", "initial status");
  assertEqual(initial.settings.year, 2026, "settings year");
  assertEqual(initial.settings.requirements.late, 1, "settings late requirement");
  assertEqual(initial.staffTsv.includes("氏名\t職種"), true, "staff tsv");
  assertEqual(initial.requestsTsv.includes("氏名\t区分"), true, "requests tsv");
  assertEqual(initial.scheduleTsv.includes("職種\t氏名"), true, "schedule tsv");
  assertEqual(initial.schedule.rows.length, sampleMonthlyScheduleDocument.staff.length, "initial rows");
  assertEqual(findAction(initial, "solve").enabled, true, "solve initially enabled");
  assertEqual(findAction(initial, "save").enabled, true, "save initially enabled");
  assertEqual(findAction(initial, "load").enabled, true, "load initially enabled");
  assertEqual(findAction(initial, "backup").enabled, true, "backup initially enabled");
  assertEqual(findAction(initial, "applySettings").enabled, true, "settings initially enabled");
  assertEqual(findAction(initial, "applyStaffTsv").enabled, true, "staff tsv initially enabled");
  assertEqual(findAction(initial, "applyRequestsTsv").enabled, true, "requests tsv initially enabled");
  assertEqual(findAction(initial, "applyScheduleTsv").enabled, true, "schedule tsv initially enabled");
  assertEqual(findAction(initial, "exportExcel").enabled, false, "export initially disabled");

  const solverResponse = await handleSolveSchedule(
    {
      document: sampleMonthlyScheduleDocument,
      options: {
        mode: "create",
        timeLimitSeconds: 10,
      },
    },
    {
      appVersion: "0.1.0-test",
      now: () => new Date(2026, 4, 19, 20, 0, 0),
      solver: new MockSolverRunner(),
    },
  );
  const solved = buildAppViewModelFromSolveResponse(sampleMonthlyScheduleDocument, solverResponse);
  assertEqual(solved.status.label, "作成できました（確認事項あり）", "solved status");
  assertEqual(solved.diagnostics?.sections[0].title, "確認事項", "diagnostic section");
  assertEqual(findAction(solved, "exportExcel").enabled, true, "export enabled after usable solve");
}

function findAction(viewModel: { actions: { id: string; enabled: boolean }[] }, id: string): { enabled: boolean } {
  const action = viewModel.actions.find((item) => item.id === id);
  if (!action) throw new Error(`action not found: ${id}`);
  return action;
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

main().catch((error) => {
  console.error(error);
  throw error;
});
