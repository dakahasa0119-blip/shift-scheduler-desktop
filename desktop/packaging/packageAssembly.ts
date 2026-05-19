import { solverPlatformForReleaseTarget } from "./releaseAutomation";
import type { ReleaseTarget } from "./releaseManifest";

export interface PackageAssemblyEntry {
  source: string;
  destination: string;
  required: boolean;
}

export interface PackageAssemblyPlan {
  target: ReleaseTarget;
  outputDirectory: string;
  entries: PackageAssemblyEntry[];
}

export interface BuildPackageAssemblyPlanOptions {
  target: ReleaseTarget;
  outputRoot?: string;
}

export interface PackageAssemblyFileSystem {
  exists(path: string): boolean;
}

export interface PackageAssemblyCheck {
  ok: boolean;
  missingRequired: PackageAssemblyEntry[];
}

export function buildPackageAssemblyPlan(options: BuildPackageAssemblyPlanOptions): PackageAssemblyPlan {
  const outputRoot = options.outputRoot || "/tmp/shift-scheduler-release";
  const outputDirectory = joinPath(outputRoot, options.target);
  const solverPlatform = solverPlatformForReleaseTarget(options.target);
  const solverExecutable = solverPlatform === "windows-x64" ? "shift-solver.exe" : "shift-solver";
  const launcher =
    options.target === "windows-prototype"
      ? {
          source: "desktop/packaging/windows/shift-scheduler-dev.cmd",
          destination: "desktop/packaging/windows/shift-scheduler-dev.cmd",
          required: true,
        }
      : {
          source: "desktop/packaging/linux/shift-scheduler-dev",
          destination: "desktop/packaging/linux/shift-scheduler-dev",
          required: true,
        };

  return {
    target: options.target,
    outputDirectory,
    entries: [
      launcher,
      {
        source: "desktop/app",
        destination: "desktop/app",
        required: true,
      },
      {
        source: "desktop/api",
        destination: "desktop/api",
        required: true,
      },
      {
        source: "desktop/core",
        destination: "desktop/core",
        required: true,
      },
      {
        source: "desktop/exports",
        destination: "desktop/exports",
        required: true,
      },
      {
        source: "desktop/storage",
        destination: "desktop/storage",
        required: true,
      },
      {
        source: "desktop/solver",
        destination: "desktop/solver",
        required: true,
      },
      {
        source: `desktop/packaging/resources/solver/${solverPlatform}/${solverExecutable}`,
        destination: `desktop/packaging/resources/solver/${solverPlatform}/${solverExecutable}`,
        required: true,
      },
      {
        source: "desktop/packaging/README.md",
        destination: "docs/packaging.md",
        required: true,
      },
      {
        source: "desktop/docs/MIGRATION_PLAN.md",
        destination: "docs/migration-plan.md",
        required: true,
      },
    ],
  };
}

export function checkPackageAssemblyPlan(plan: PackageAssemblyPlan, files: PackageAssemblyFileSystem): PackageAssemblyCheck {
  const missingRequired = plan.entries.filter((entry) => entry.required && !files.exists(entry.source));
  return {
    ok: missingRequired.length === 0,
    missingRequired,
  };
}

function joinPath(left: string, right: string): string {
  return `${left.replace(/\/+$/, "")}/${right.replace(/^\/+/, "")}`;
}
