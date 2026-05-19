import { ChromePdfRenderer } from "../exports/pdfRenderer";
import {
  detectChromeExecutable,
  NodePdfFileSystem,
  NodePdfProcessExecutor,
  NodePdfTempFileProvider,
} from "../exports/nodePdfRuntime";

declare const require: (name: string) => any;

const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

async function main(): Promise<void> {
  const chrome = detectChromeExecutable();
  if (!chrome) {
    console.log("skip: chrome executable not found");
    return;
  }

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "shift-pdf-smoke-"));
  const outputPath = path.join(directory, "schedule.pdf");
  const renderer = new ChromePdfRenderer({
    executablePath: chrome,
    files: new NodePdfFileSystem(),
    tempFiles: new NodePdfTempFileProvider(directory),
    process: new NodePdfProcessExecutor(),
    timeoutMs: 30000,
  });

  await renderer.renderHtmlToPdf({
    html: '<!doctype html><html lang="ja"><meta charset="utf-8"><body><h1>勤務表</h1></body></html>',
    destinationPath: outputPath,
  });

  const pdf = await fs.readFile(outputPath);
  assertEqual(String.fromCharCode(pdf[0], pdf[1], pdf[2], pdf[3]), "%PDF", "pdf signature");
  assertTrue(pdf.length > 1000, "pdf size");
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

main().catch((error) => {
  console.error(error);
  throw error;
});
