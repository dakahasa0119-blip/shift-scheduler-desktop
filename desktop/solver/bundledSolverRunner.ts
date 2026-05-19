import type { SolverRunner, SolverRunOptions } from "../api/handlers";
import type { SolverInputPayload } from "../core/solverInput";
import type { SolverOutputPayload } from "../core/solverOutput";
import {
  buildBundledSolverInvocation,
  type BundledSolverRuntimeConfig,
  type BundledSolverInvocation,
} from "./bundledSolverTypes";

export interface SolverProcessExecutor {
  run(invocation: BundledSolverInvocation): Promise<SolverProcessResult>;
}

export interface SolverProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  elapsedMs: number;
}

export interface SolverFileSystem {
  writeText(path: string, content: string): Promise<void>;
  readText(path: string): Promise<string>;
  remove(path: string): Promise<void>;
}

export interface SolverTempFileProvider {
  createTempPaths(prefix: string): Promise<SolverTempPaths>;
}

export interface SolverTempPaths {
  inputPath: string;
  outputPath: string;
  debugPath: string;
}

export interface BundledSolverRunnerDependencies {
  config: BundledSolverRuntimeConfig;
  files: SolverFileSystem;
  tempFiles: SolverTempFileProvider;
  process: SolverProcessExecutor;
  logger?: BundledSolverLogger;
}

export interface BundledSolverLogger {
  info(message: string, details?: unknown): void;
  error(message: string, details?: unknown): void;
}

export class BundledSolverRunner implements SolverRunner {
  constructor(private readonly deps: BundledSolverRunnerDependencies) {}

  async solve(input: SolverInputPayload, options: SolverRunOptions): Promise<SolverOutputPayload> {
    const tempPaths = await this.deps.tempFiles.createTempPaths("shift-solver");
    const invocation = buildBundledSolverInvocation(
      this.deps.config,
      tempPaths.inputPath,
      tempPaths.outputPath,
      tempPaths.debugPath,
      options.timeLimitSeconds,
    );

    await this.deps.files.writeText(tempPaths.inputPath, JSON.stringify(input, null, 2));
    this.deps.logger?.info("solver invocation started", {
      executablePath: invocation.executablePath,
      timeoutSeconds: invocation.timeoutSeconds,
    });

    try {
      const result = await this.deps.process.run(invocation);
      if (result.exitCode !== 0) {
        throw new Error(`solver exited with code ${result.exitCode}: ${result.stderr || result.stdout}`);
      }
      const outputText = await this.deps.files.readText(tempPaths.outputPath);
      const output = JSON.parse(outputText) as SolverOutputPayload;
      this.deps.logger?.info("solver invocation completed", {
        elapsedMs: result.elapsedMs,
        status: output.status,
      });
      return output;
    } catch (error) {
      this.deps.logger?.error("solver invocation failed", {
        error: error instanceof Error ? error.message : String(error),
        inputPath: tempPaths.inputPath,
        outputPath: tempPaths.outputPath,
        debugPath: tempPaths.debugPath,
      });
      throw error;
    } finally {
      if (!this.deps.config.keepDebugFiles) {
        await removeIfExists(this.deps.files, tempPaths.inputPath);
        await removeIfExists(this.deps.files, tempPaths.outputPath);
        await removeIfExists(this.deps.files, tempPaths.debugPath);
      }
    }
  }
}

async function removeIfExists(files: SolverFileSystem, path: string): Promise<void> {
  try {
    await files.remove(path);
  } catch {
    // Temporary cleanup is best-effort. Support logs should keep the original failure.
  }
}
