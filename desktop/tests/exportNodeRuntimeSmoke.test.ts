import { NodeExportFileWriter, NodeExportPathProvider } from "../exports/nodeExportRuntime";
import { exportExcelLikeTsv, exportExcelWorkbook, exportPdfPrintHtml } from "../exports/exportFileWriter";
import { sampleMonthlyScheduleDocument, sampleSolverOutputWithAdvisory } from "../core/fixtures";
import { applySolverOutputToDocument } from "../core/solverOutput";

declare const require: (name: string) => any;

const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

async function main(): Promise<void> {
  const baseDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "shift-export-smoke-"));
  const document = applySolverOutputToDocument(sampleMonthlyScheduleDocument, sampleSolverOutputWithAdvisory);
  const result = await exportExcelLikeTsv({
    document,
    writer: new NodeExportFileWriter(),
    paths: new NodeExportPathProvider(baseDirectory),
  });

  assertTrue(result.filePath.startsWith(baseDirectory), "export path base");
  const content = await fs.readFile(result.filePath, "utf8");
  assertIncludes(content, "2026年6月 勤務表", "title");
  assertIncludes(content, "6/3 遅 1名不足", "shortage");

  const xlsx = await exportExcelWorkbook({
    document,
    writer: new NodeExportFileWriter(),
    paths: new NodeExportPathProvider(baseDirectory),
  });
  assertTrue(xlsx.filePath.startsWith(baseDirectory), "second export path base");
  assertTrue(xlsx.filePath.endsWith(".xlsx"), "xlsx extension");
  const xlsxContent = await fs.readFile(xlsx.filePath);
  assertEqual(xlsxContent[0], 0x50, "xlsx zip byte 1");
  assertEqual(xlsxContent[1], 0x4b, "xlsx zip byte 2");

  const pdf = await exportPdfPrintHtml({
    document,
    writer: new NodeExportFileWriter(),
    paths: new NodeExportPathProvider(baseDirectory),
  });
  assertTrue(pdf.filePath.endsWith(".print.html"), "pdf preview extension");
  const pdfContent = await fs.readFile(pdf.filePath, "utf8");
  assertIncludes(pdfContent, "size: A4 landscape", "pdf preview landscape");
}

function assertIncludes(text: string, expected: string, label: string): void {
  if (!text.includes(expected)) {
    throw new Error(`${label}: missing ${expected}`);
  }
}

function assertTrue(value: boolean, label: string): void {
  if (!value) {
    throw new Error(`${label}: expected true`);
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
