import { ChromePdfRenderer } from "../exports/pdfRenderer";

async function main(): Promise<void> {
  const calls: { executablePath: string; args: string[]; timeoutMs: number }[] = [];
  const written = new Map<string, string>();
  const removed: string[] = [];
  const renderer = new ChromePdfRenderer({
    executablePath: "/usr/bin/google-chrome",
    files: {
      async writeText(path: string, content: string): Promise<void> {
        written.set(path, content);
      },
      async remove(path: string): Promise<void> {
        removed.push(path);
      },
    },
    tempFiles: {
      async createHtmlPath(prefix: string): Promise<string> {
        return `/tmp/${prefix}/input.html`;
      },
    },
    process: {
      async run(command): Promise<{ exitCode: number; stdout: string; stderr: string }> {
        calls.push(command);
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    },
    timeoutMs: 1234,
  });

  await renderer.renderHtmlToPdf({
    html: "<html><body>勤務表</body></html>",
    destinationPath: "/tmp/schedule.pdf",
  });

  assertEqual(written.get("/tmp/shift-print/input.html"), "<html><body>勤務表</body></html>", "html written");
  assertEqual(calls.length, 1, "process call count");
  assertEqual(calls[0].executablePath, "/usr/bin/google-chrome", "chrome path");
  assertTrue(calls[0].args.includes("--headless"), "headless arg");
  assertTrue(calls[0].args.includes("--print-to-pdf=/tmp/schedule.pdf"), "pdf arg");
  assertEqual(calls[0].timeoutMs, 1234, "timeout");
  assertEqual(removed[0], "/tmp/shift-print/input.html", "temp removed");
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
