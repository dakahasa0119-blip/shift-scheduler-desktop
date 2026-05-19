import { MockSolverRunner } from "../api/mockSolverRunner";
import { handleSolveSchedule } from "../api/handlers";
import { buildAppViewModelFromSolveResponse } from "../app/appViewModel";
import { buildExportWorkbook } from "../exports/exportWorkbook";
import { renderWorkbookAsPrintHtml } from "../exports/printHtmlWriter";
import { sampleMonthlyScheduleDocument } from "../core/fixtures";

async function main(): Promise<void> {
  const response = await handleSolveSchedule(
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
  const viewModel = buildAppViewModelFromSolveResponse(sampleMonthlyScheduleDocument, response);
  const html = renderWorkbookAsPrintHtml(buildExportWorkbook(viewModel));

  assertIncludes(html, '<html lang="ja">', "language");
  assertIncludes(html, "@page", "print page");
  assertIncludes(html, "size: A4 landscape", "landscape");
  assertIncludes(html, "2026年6月 勤務表", "title");
  assertIncludes(html, "6/3 遅 1名不足", "shortage");
  assertIncludes(html, "tone-requestUnmet", "unmet request tone");
}

function assertIncludes(text: string, expected: string, label: string): void {
  if (!text.includes(expected)) {
    throw new Error(`${label}: missing ${expected}`);
  }
}

main().catch((error) => {
  console.error(error);
  throw error;
});
