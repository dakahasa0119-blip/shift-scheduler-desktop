import type { PdfFileSystem, PdfProcessCommand, PdfProcessExecutor, PdfProcessResult, PdfTempFileProvider } from "./pdfRenderer";

declare const require: (name: string) => any;
declare const process: {
  env: Record<string, string | undefined>;
};

const childProcess = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

export class NodePdfFileSystem implements PdfFileSystem {
  async writeText(filePath: string, content: string): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf8");
  }

  async remove(filePath: string): Promise<void> {
    await fs.rm(filePath, { force: true });
  }
}

export class NodePdfTempFileProvider implements PdfTempFileProvider {
  constructor(private readonly baseDirectory: string = path.join(os.tmpdir(), "shift-desktop", "pdf")) {}

  async createHtmlPath(prefix: string): Promise<string> {
    await fs.mkdir(this.baseDirectory, { recursive: true });
    const directory = await fs.mkdtemp(path.join(this.baseDirectory, `${prefix}-`));
    return path.join(directory, "input.html");
  }
}

export class NodePdfProcessExecutor implements PdfProcessExecutor {
  run(command: PdfProcessCommand): Promise<PdfProcessResult> {
    return new Promise((resolve) => {
      const child = childProcess.spawn(command.executablePath, command.args, {
        shell: false,
        windowsHide: true,
      });
      const stdoutChunks: string[] = [];
      const stderrChunks: string[] = [];
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, command.timeoutMs);

      child.stdout.on("data", (chunk: unknown) => stdoutChunks.push(String(chunk)));
      child.stderr.on("data", (chunk: unknown) => stderrChunks.push(String(chunk)));
      child.on("error", (error: Error) => {
        clearTimeout(timer);
        resolve({
          exitCode: -1,
          stdout: stdoutChunks.join(""),
          stderr: error.message,
        });
      });
      child.on("close", (code: number | null) => {
        clearTimeout(timer);
        resolve({
          exitCode: timedOut ? -2 : (code ?? -1),
          stdout: stdoutChunks.join(""),
          stderr: stderrChunks.join(""),
        });
      });
    });
  }
}

export function detectChromeExecutable(): string | null {
  const explicit = process.env.SHIFT_DESKTOP_CHROME_PATH;
  if (explicit) return explicit;
  const candidates = [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  return candidates.find((candidate) => exists(candidate)) || null;
}

function exists(filePath: string): boolean {
  try {
    require("node:fs").accessSync(filePath);
    return true;
  } catch {
    return false;
  }
}
