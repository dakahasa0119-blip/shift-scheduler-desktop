import type {
  BundledSolverArtifact,
  BundledSolverManifest,
  BundledSolverRuntimeConfig,
  SolverPlatform,
} from "./bundledSolverTypes";

export interface ResolveBundledSolverConfigOptions {
  manifest: BundledSolverManifest;
  platform: SolverPlatform;
  resourceRoot: string;
  workDirectory: string;
  supportLogDirectory: string;
  keepDebugFiles: boolean;
  defaultTimeLimitSeconds: number;
  joinPath: (...parts: string[]) => string;
}

export function resolveBundledSolverRuntimeConfig(
  options: ResolveBundledSolverConfigOptions,
): BundledSolverRuntimeConfig {
  const artifact = findArtifact(options.manifest, options.platform);
  return {
    platform: options.platform,
    executablePath: options.joinPath(options.resourceRoot, artifact.relativePath, artifact.executableName),
    workDirectory: options.workDirectory,
    supportLogDirectory: options.supportLogDirectory,
    keepDebugFiles: options.keepDebugFiles,
    defaultTimeLimitSeconds: options.defaultTimeLimitSeconds,
  };
}

function findArtifact(manifest: BundledSolverManifest, platform: SolverPlatform): BundledSolverArtifact {
  const artifact = manifest.artifacts.find((item) => item.platform === platform);
  if (!artifact) {
    throw new Error(`bundled solver artifact not found for platform: ${platform}`);
  }
  return artifact;
}

export const initialBundledSolverManifest: BundledSolverManifest = {
  schemaVersion: "desktop-bundled-solver-manifest/v1",
  artifacts: [
    {
      platform: "linux-x64",
      executableName: "shift-solver",
      relativePath: "solver/linux-x64",
      version: "prototype",
    },
    {
      platform: "windows-x64",
      executableName: "shift-solver.exe",
      relativePath: "solver/windows-x64",
      version: "prototype",
    },
  ],
};
