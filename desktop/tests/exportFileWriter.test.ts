import type { MonthlyScheduleDocument } from "../core/domain";
import { sampleMonthlyScheduleDocument, sampleSolverOutputWithAdvisory } from "../core/fixtures";
import { applySolverOutputToDocument } from "../core/solverOutput";
import {
  exportExcelLikeTsv,
  exportExcelWorkbook,
  type ExportBinaryFileWriter,
  type ExportPathProvider,
} from "../exports/exportFileWriter";

async function main(): Promise<void> {
  const document = applySolverOutputToDocument(sampleMonthlyScheduleDocument, sampleSolverOutputWithAdvisory);
  const writer = new MemoryWriter();
  const paths = new FixedPathProvider("/tmp/schedule.tsv");

  const result = await exportExcelLikeTsv({
    document,
    writer,
    paths,
  });

  assertEqual(result.filePath, "/tmp/schedule.tsv", "default path");
  assertEqual(result.format, "tsv", "format");
  assertIncludes(writer.files.get("/tmp/schedule.tsv") || "", "2026年6月 勤務表", "title");
  assertIncludes(writer.files.get("/tmp/schedule.tsv") || "", "6/3 遅 1名不足", "shortage");

  const explicit = await exportExcelLikeTsv({
    document,
    destinationPath: "/tmp/custom.tsv",
    writer,
    paths,
  });
  assertEqual(explicit.filePath, "/tmp/custom.tsv", "explicit path");
  assertIncludes(writer.files.get("/tmp/custom.tsv") || "", "6/6 有山 希望日勤", "unmet request");

  const xlsx = await exportExcelWorkbook({
    document,
    destinationPath: "/tmp/custom.xlsx",
    writer,
    paths,
  });
  assertEqual(xlsx.filePath, "/tmp/custom.xlsx", "xlsx path");
  assertEqual(xlsx.format, "xlsx", "xlsx format");
  assertEqual(writer.binaries.get("/tmp/custom.xlsx")?.[0], 0x50, "xlsx zip byte");
}

class MemoryWriter implements ExportBinaryFileWriter {
  files = new Map<string, string>();
  binaries = new Map<string, Uint8Array>();

  async writeText(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  async writeBinary(path: string, content: Uint8Array): Promise<void> {
    this.binaries.set(path, content);
  }
}

class FixedPathProvider implements ExportPathProvider {
  constructor(private readonly path: string) {}

  defaultExcelPath(_document: MonthlyScheduleDocument): string {
    return this.path;
  }
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
