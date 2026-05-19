import { buildDiagnosticPanelViewModel } from "../app/diagnosticViewModel";
import { sampleMonthlyScheduleDocument, sampleSolverOutputWithAdvisory } from "../core/fixtures";
import { buildScheduleDiagnostics } from "../core/solverOutput";

function main(): void {
  const diagnostics = buildScheduleDiagnostics(sampleMonthlyScheduleDocument, sampleSolverOutputWithAdvisory);
  const viewModel = buildDiagnosticPanelViewModel(diagnostics);

  assertEqual(viewModel.result.label, "作成できました（確認事項あり）", "result label");
  assertEqual(viewModel.result.severity, "note", "result severity");
  assertEqual(
    viewModel.sections.map((section) => section.id).join(","),
    "summary,shortages,unmetRequests,suggestions",
    "section order",
  );

  const summary = viewModel.sections[0];
  assertEqual(summary.title, "確認事項", "summary title");
  assertTrue(summary.items.some((item) => item.primary === "許容内の不足 1件"), "allowed shortage summary");
  assertTrue(summary.items.some((item) => item.primary === "勤務希望未充足 1件"), "unmet shift request summary");

  const shortage = viewModel.sections.find((section) => section.id === "shortages");
  assertEqual(shortage?.items[0].primary, "6/3 遅 1名不足", "shortage primary");
  assertTrue(shortage?.items[0].secondary.includes("許容内") || false, "shortage secondary");

  const unmet = viewModel.sections.find((section) => section.id === "unmetRequests");
  assertEqual(unmet?.items[0].primary, "6/6 有山 希望日勤", "unmet request primary");
  assertEqual(unmet?.items[0].secondary, "割当: 早", "unmet request secondary");
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertTrue(value: boolean, label: string): void {
  if (!value) {
    throw new Error(`${label}: expected true`);
  }
}

main();
