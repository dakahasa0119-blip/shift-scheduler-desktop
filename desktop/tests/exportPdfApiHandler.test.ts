import { handleExportPdf } from "../api/handlers";
import type { MonthlyScheduleDocument } from "../core/domain";
import { sampleMonthlyScheduleDocument, sampleSolverOutputWithAdvisory } from "../core/fixtures";
import { applySolverOutputToDocument } from "../core/solverOutput";
import type { RenderHtmlToPdfOptions } from "../exports/pdfRenderer";

async function main(): Promise<void> {
  const document = applySolverOutputToDocument(sampleMonthlyScheduleDocument, sampleSolverOutputWithAdvisory);
  const files = new Map<string, string>();
  const pdfs = new Map<string, string>();
  const response = await handleExportPdf(
    {
      document,
      destinationPath: "/tmp/handler-export.pdf",
    },
    {
      exports: {
        writer: {
          async writeText(path: string, content: string): Promise<void> {
            files.set(path, content);
          },
          async writeBinary(_path: string, _content: Uint8Array): Promise<void> {},
        },
        paths: {
          defaultExcelPath(_document: MonthlyScheduleDocument): string {
            return "/tmp/default-export.xlsx";
          },
          defaultPdfPath(_document: MonthlyScheduleDocument): string {
            return "/tmp/default-export.print.html";
          },
        },
        pdfRenderer: {
          async renderHtmlToPdf(options: RenderHtmlToPdfOptions): Promise<void> {
            pdfs.set(options.destinationPath, options.html);
          },
        },
      },
    },
  );

  assertEqual(response.ok, true, "export ok");
  if (!response.ok) return;
  assertEqual(response.filePath, "/tmp/handler-export.pdf", "export path");
  assertEqual(response.format, "pdf", "format");
  assertIncludes(pdfs.get("/tmp/handler-export.pdf") || "", "size: A4 landscape", "landscape");
  assertIncludes(pdfs.get("/tmp/handler-export.pdf") || "", "6/3 遅 1名不足", "diagnostic");
  assertEqual(files.size, 0, "print html fallback not used");
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
