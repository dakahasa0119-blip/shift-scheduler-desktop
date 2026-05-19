import type { BundledSolverManifest, SolverPlatform } from "../solver/bundledSolverTypes";
import { initialBundledSolverManifest } from "../solver/manifest";

export type ReleaseTarget = "linux-prototype" | "windows-prototype";

export const releaseTargets: ReleaseTarget[] = ["linux-prototype", "windows-prototype"];

export interface ReleaseFileRequirement {
  id: string;
  path: string;
  required: boolean;
  description: string;
}

export interface ReleaseManifest {
  target: ReleaseTarget;
  files: ReleaseFileRequirement[];
}

export interface ReleaseReadinessCheck {
  ok: boolean;
  target: ReleaseTarget;
  missingRequired: ReleaseFileRequirement[];
  missingOptional: ReleaseFileRequirement[];
}

export interface ReleaseFileSystem {
  exists(path: string): boolean;
}

export interface BuildReleaseManifestOptions {
  target: ReleaseTarget;
  solverManifest?: BundledSolverManifest;
}

export function isReleaseTarget(value: string): value is ReleaseTarget {
  return releaseTargets.some((target) => target === value);
}

export function parseReleaseTarget(value: string | undefined): ReleaseTarget {
  if (!value) return "linux-prototype";
  if (isReleaseTarget(value)) return value;
  throw new Error(`unknown release target: ${value}`);
}

export function buildReleaseManifest(options: BuildReleaseManifestOptions): ReleaseManifest {
  const solverManifest = options.solverManifest || initialBundledSolverManifest;
  const platform: SolverPlatform = options.target === "windows-prototype" ? "windows-x64" : "linux-x64";
  const solver = solverManifest.artifacts.find((artifact) => artifact.platform === platform);
  if (!solver) {
    throw new Error(`solver artifact missing from manifest for ${platform}`);
  }

  return {
    target: options.target,
    files: [
      {
        id: "solver",
        path: `desktop/packaging/resources/${solver.relativePath}/${solver.executableName}`,
        required: true,
        description: "Bundled solver executable",
      },
      {
        id: "linux-dev-launcher",
        path: "desktop/packaging/linux/shift-scheduler-dev",
        required: options.target === "linux-prototype",
        description: "Linux developer launcher wrapper",
      },
      {
        id: "windows-dev-launcher",
        path: "desktop/packaging/windows/shift-scheduler-dev.cmd",
        required: options.target === "windows-prototype",
        description: "Windows developer launcher wrapper",
      },
      {
        id: "linux-desktop-entry-template",
        path: "desktop/packaging/linuxDesktopEntry.ts",
        required: options.target === "linux-prototype",
        description: "Linux desktop entry renderer",
      },
      {
        id: "packaging-doc",
        path: "desktop/packaging/README.md",
        required: true,
        description: "Packaging documentation",
      },
    ],
  };
}

export function checkReleaseReadiness(manifest: ReleaseManifest, files: ReleaseFileSystem): ReleaseReadinessCheck {
  const missing = manifest.files.filter((entry) => !files.exists(entry.path));
  return {
    ok: missing.every((entry) => !entry.required),
    target: manifest.target,
    missingRequired: missing.filter((entry) => entry.required),
    missingOptional: missing.filter((entry) => !entry.required),
  };
}
