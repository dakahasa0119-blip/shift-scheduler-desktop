import { handleExportExcel } from "../api/handlers";
import type { MonthlyScheduleDocument } from "../core/domain";
import { sampleMonthlyScheduleDocument, sampleSolverOutputWithAdvisory } from "../core/fixtures";
import { applySolverOutputToDocument } from "../core/solverOutput";

async function main(): Promise<void> {
  const document = applySolverOutputToDocument(sampleMonthlyScheduleDocument, sampleSolverOutputWithAdvisory);
  const files = new Map<string, string>();
  const response = await handleExportExcel(
    {
      document,
      destinationPath: "/tmp/handler-export.xlsx",
    },
    {
      exports: {
        writer: {
          async writeText(path: string, content: string): Promise<void> {
            files.set(path, content);
          },
          async writeBinary(path: string, content: Uint8Array): Promise<void> {
            files.set(path, String(content[0]));
          },
        },
        paths: {
          defaultExcelPath(_document: MonthlyScheduleDocument): string {
            return "/tmp/default-export.tsv";
          },
        },
      },
    },
  );

  assertEqual(response.ok, true, "export ok");
  if (!response.ok) return;
  assertEqual(response.filePath, "/tmp/handler-export.xlsx", "export path");
  assertEqual(files.get("/tmp/handler-export.xlsx"), "80", "xlsx zip byte exported");
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
