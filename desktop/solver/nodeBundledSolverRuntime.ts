import type {
  SolverFileSystem,
  SolverProcessExecutor,
  SolverProcessResult,
  SolverTempFileProvider,
  SolverTempPaths,
} from "./bundledSolverRunner";
import type { BundledSolverInvocation } from "./bundledSolverTypes";

declare const require: (name: string) => any;
declare const process: {
  platform: string;
};

const fs = require("node:fs/promises");
const childProcess = require("node:child_process");
const path = require("node:path");
const os = require("node:os");

export class NodeSolverFileSystem implements SolverFileSystem {
  async writeText(filePath: string, content: string): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf8");
  }

  async readText(filePath: string): Promise<string> {
    return fs.readFile(filePath, "utf8");
  }

  async remove(filePath: string): Promise<void> {
    await fs.rm(filePath, { force: true });
  }
}

export class NodeSolverTempFileProvider implements SolverTempFileProvider {
  constructor(private readonly baseDirectory: string = path.join(os.tmpdir(), "shift-desktop-solver")) {}

  async createTempPaths(prefix: string): Promise<SolverTempPaths> {
    await fs.mkdir(this.baseDirectory, { recursive: true });
    const directory = await fs.mkdtemp(path.join(this.baseDirectory, `${prefix}-`));
    return {
      inputPath: path.join(directory, "input.json"),
      outputPath: path.join(directory, "output.json"),
      debugPath: path.join(directory, "debug.json"),
    };
  }
}

export class NodeSolverProcessExecutor implements SolverProcessExecutor {
  async run(invocation: BundledSolverInvocation): Promise<SolverProcessResult> {
    const startedAt = Date.now();
    return new Promise((resolve) => {
      const child = childProcess.spawn(invocation.executablePath, invocation.args, {
        shell: false,
        windowsHide: true,
      });
      const stdoutChunks: string[] = [];
      const stderrChunks: string[] = [];
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, invocation.timeoutSeconds * 1000);

      child.stdout.on("data", (chunk: unknown) => stdoutChunks.push(String(chunk)));
      child.stderr.on("data", (chunk: unknown) => stderrChunks.push(String(chunk)));
      child.on("error", (error: Error) => {
        clearTimeout(timeout);
        resolve({
          exitCode: -1,
          stdout: stdoutChunks.join(""),
          stderr: error.message,
          elapsedMs: Date.now() - startedAt,
        });
      });
      child.on("close", (code: number | null) => {
        clearTimeout(timeout);
        resolve({
          exitCode: timedOut ? -2 : (code ?? -1),
          stdout: stdoutChunks.join(""),
          stderr: stderrChunks.join(""),
          elapsedMs: Date.now() - startedAt,
        });
      });
    });
  }
}

export function detectSolverPlatform(): "linux-x64" | "windows-x64" {
  if (process.platform === "win32") return "windows-x64";
  return "linux-x64";
}
