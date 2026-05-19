import { MockSolverRunner } from "../api/mockSolverRunner";
import { handleSolveSchedule } from "../api/handlers";
import { buildAppViewModelFromSolveResponse } from "../app/appViewModel";
import { buildExportWorkbook } from "../exports/exportWorkbook";
import { renderWorkbookAsXlsx } from "../exports/xlsxWriter";
import { sampleMonthlyScheduleDocument } from "../core/fixtures";

declare const TextDecoder: {
  new (): {
    decode(input: Uint8Array): string;
  };
};

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
  const xlsx = renderWorkbookAsXlsx(workbook);

  assertEqual(xlsx[0], 0x50, "zip byte 1");
  assertEqual(xlsx[1], 0x4b, "zip byte 2");
  assertIncludesAscii(xlsx, "[Content_Types].xml", "content types file");
  assertIncludesAscii(xlsx, "xl/worksheets/sheet1.xml", "worksheet file");
  assertIncludesAscii(xlsx, "6/3 遅 1名不足", "diagnostic text");
}

function assertIncludesAscii(bytes: Uint8Array, expected: string, label: string): void {
  const text = new TextDecoder().decode(bytes);
  if (!text.includes(expected)) {
    throw new Error(`${label}: missing ${expected}`);
  }
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
