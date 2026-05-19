import { MockSolverRunner } from "../api/mockSolverRunner";
import { handleSolveSchedule } from "../api/handlers";
import { buildAppViewModelFromSolveResponse } from "../app/appViewModel";
import { buildExportWorkbook, renderWorkbookAsTsv } from "../exports/exportWorkbook";
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
  const workbook = buildExportWorkbook(viewModel);
  const sheet = workbook.sheets[0];

  assertEqual(workbook.fileBaseName, "2026年6月_勤務表", "file base name");
  assertEqual(sheet.name, "勤務表", "sheet name");
  assertEqual(sheet.frozenColumns, 2, "frozen columns");
  assertEqual(sheet.frozenRows, 3, "frozen rows");
  assertEqual(sheet.print.orientation, "landscape", "print orientation");
  assertEqual(sheet.rows[1].cells[0].value, "職種", "role header");
  assertEqual(sheet.rows[3].cells[0].value, "介護リーダー", "first role");
  assertEqual(sheet.rows[4].cells[7].tone, "requestUnmet", "unmet request tone");

  const tsv = renderWorkbookAsTsv(workbook);
  assertIncludes(tsv, "2026年6月 勤務表", "title");
  assertIncludes(tsv, "6/3 遅 1名不足", "shortage diagnostic");
  assertIncludes(tsv, "6/6 有山 希望日勤", "unmet request diagnostic");
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

main().catch((error) => {
  console.error(error);
  throw error;
});
