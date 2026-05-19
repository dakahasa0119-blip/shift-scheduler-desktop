export type SolverPlatform = "linux-x64" | "windows-x64";

export interface BundledSolverArtifact {
  platform: SolverPlatform;
  executableName: string;
  relativePath: string;
  version: string;
}

export interface BundledSolverManifest {
  schemaVersion: "desktop-bundled-solver-manifest/v1";
  artifacts: BundledSolverArtifact[];
}

export interface BundledSolverRuntimeConfig {
  platform: SolverPlatform;
  executablePath: string;
  workDirectory: string;
  supportLogDirectory: string;
  keepDebugFiles: boolean;
  defaultTimeLimitSeconds: number;
}

export interface BundledSolverInvocation {
  executablePath: string;
  args: string[];
  inputPath: string;
  outputPath: string;
  debugPath: string;
  timeoutSeconds: number;
}

export function buildBundledSolverInvocation(
  config: BundledSolverRuntimeConfig,
  inputPath: string,
  outputPath: string,
  debugPath: string,
  timeLimitSeconds?: number,
): BundledSolverInvocation {
  const timeoutSeconds = normalizeSolverTimeout(timeLimitSeconds || config.defaultTimeLimitSeconds);
  return {
    executablePath: config.executablePath,
    args: [
      "solve",
      inputPath,
      "--out",
      outputPath,
      "--debug",
      debugPath,
      "--time-limit",
      String(timeoutSeconds),
    ],
    inputPath,
    outputPath,
    debugPath,
    timeoutSeconds,
  };
}

function normalizeSolverTimeout(value: number): number {
  if (!Number.isFinite(value)) return 240;
  return Math.max(10, Math.min(1800, Math.round(value)));
}
