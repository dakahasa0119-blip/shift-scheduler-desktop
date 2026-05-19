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
  const outputDirectory = joinPath(outputRoot, packageDirectoryName(options.target));
  const solverPlatform = solverPlatformForReleaseTarget(options.target);
  const solverExecutable = solverPlatform === "windows-x64" ? "shift-solver.exe" : "shift-solver";
  const nodeExecutable = solverPlatform === "windows-x64" ? "node.exe" : "node";
  const launcher =
    options.target === "windows-prototype"
      ? {
          source: "desktop/packaging/windows/start-shift-scheduler.vbs",
          destination: "start-shift-scheduler.vbs",
          required: true,
        }
      : {
          source: "desktop/packaging/linux/start-shift-scheduler.sh",
          destination: "start-shift-scheduler.sh",
          required: true,
        };

  return {
    target: options.target,
    outputDirectory,
    entries: [
      launcher,
      ...(options.target === "windows-prototype"
        ? [
            {
              source: "desktop/packaging/windows/start-shift-scheduler.cmd",
              destination: "start-shift-scheduler.cmd",
              required: true,
            },
          ]
        : [
            {
              source: "desktop/packaging/linux/install-desktop-launcher.sh",
              destination: "install-desktop-launcher.sh",
              required: true,
            },
          ]),
      {
        source: "desktop/dist/shift-scheduler.cjs",
        destination: "desktop/dist/shift-scheduler.cjs",
        required: true,
      },
      {
        source: `desktop/packaging/resources/node/${solverPlatform}/${nodeExecutable}`,
        destination: `desktop/packaging/runtime/${nodeExecutable}`,
        required: true,
      },
      {
        source: `desktop/packaging/resources/solver/${solverPlatform}/${solverExecutable}`,
        destination: `desktop/packaging/resources/solver/${solverPlatform}/${solverExecutable}`,
        required: true,
      },
      {
        source: "desktop/packaging/USER_GUIDE.md",
        destination: "docs/user-guide.md",
        required: true,
      },
      {
        source: "desktop/packaging/START_HERE.txt",
        destination: "README.txt",
        required: true,
      },
      {
        source: "desktop/packaging/RELEASE_NOTES.md",
        destination: "docs/release-notes.md",
        required: true,
      },
      {
        source: "desktop/packaging/SUPPORT_INFO.txt",
        destination: "SUPPORT_INFO.txt",
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

export function packageDirectoryName(target: ReleaseTarget): string {
  return target === "windows-prototype" ? "shift-scheduler-windows-x64" : "shift-scheduler-linux-x64";
}

function joinPath(left: string, right: string): string {
  return `${left.replace(/\/+$/, "")}/${right.replace(/^\/+/, "")}`;
}
