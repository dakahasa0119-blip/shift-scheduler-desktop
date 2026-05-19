import { BundledSolverRunner } from "../solver/bundledSolverRunner";
import type {
  SolverFileSystem,
  SolverProcessExecutor,
  SolverTempFileProvider,
} from "../solver/bundledSolverRunner";
import type { BundledSolverRuntimeConfig } from "../solver/bundledSolverTypes";
import { sampleMonthlyScheduleDocument, sampleSolverOutputWithAdvisory } from "../core/fixtures";
import { buildSolverInputPayload } from "../core/solverInput";

async function main(): Promise<void> {
  const files = new MemoryFileSystem();
  const tempFiles = new FixedTempFileProvider();
  const process = new FakeProcessExecutor(files);
  const config: BundledSolverRuntimeConfig = {
    platform: "linux-x64",
    executablePath: "/app/resources/solver/linux-x64/shift-solver",
    workDirectory: "/tmp/app",
    supportLogDirectory: "/tmp/app/logs",
    keepDebugFiles: false,
    defaultTimeLimitSeconds: 120,
  };
  const runner = new BundledSolverRunner({
    config,
    files,
    tempFiles,
    process,
  });
  const input = buildSolverInputPayload(sampleMonthlyScheduleDocument, "2026-05-19 20:00:00");
  const output = await runner.solve(input, { timeLimitSeconds: 9, mode: "create" });

  assertEqual(output.status, "OPTIMAL", "solver output status");
  assertEqual(process.calls.length, 1, "process call count");
  assertEqual(process.calls[0].timeoutSeconds, 10, "normalized timeout");
  assertTrue(process.calls[0].args.includes("--time-limit"), "time limit argument");
  assertEqual(files.exists("/tmp/shift-solver-input.json"), false, "input cleanup");
  assertEqual(files.exists("/tmp/shift-solver-output.json"), false, "output cleanup");
  assertEqual(files.exists("/tmp/shift-solver-debug.json"), false, "debug cleanup");
}

class MemoryFileSystem implements SolverFileSystem {
  private readonly values = new Map<string, string>();

  async writeText(path: string, content: string): Promise<void> {
    this.values.set(path, content);
  }

  async readText(path: string): Promise<string> {
    const value = this.values.get(path);
    if (value == null) throw new Error(`missing file: ${path}`);
    return value;
  }

  async remove(path: string): Promise<void> {
    this.values.delete(path);
  }

  exists(path: string): boolean {
    return this.values.has(path);
  }
}

class FixedTempFileProvider implements SolverTempFileProvider {
  async createTempPaths(): Promise<{ inputPath: string; outputPath: string; debugPath: string }> {
    return {
      inputPath: "/tmp/shift-solver-input.json",
      outputPath: "/tmp/shift-solver-output.json",
      debugPath: "/tmp/shift-solver-debug.json",
    };
  }
}

class FakeProcessExecutor implements SolverProcessExecutor {
  readonly calls: Parameters<SolverProcessExecutor["run"]>[0][] = [];

  constructor(private readonly files: SolverFileSystem) {}

  async run(invocation: Parameters<SolverProcessExecutor["run"]>[0]): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
    elapsedMs: number;
  }> {
    this.calls.push(invocation);
    await this.files.writeText(invocation.outputPath, JSON.stringify(sampleSolverOutputWithAdvisory));
    await this.files.writeText(invocation.debugPath, JSON.stringify(sampleSolverOutputWithAdvisory.diagnostics || {}));
    return {
      exitCode: 0,
      stdout: "",
      stderr: "",
      elapsedMs: 123,
    };
  }
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
