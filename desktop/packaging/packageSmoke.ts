import type { ReleaseTarget } from "./releaseManifest";

export interface PackageSmokePlan {
  target: ReleaseTarget;
  outputDirectory: string;
  launcherPath: string;
  port: number;
  expectedBaseUrl: string;
  dataDirectory: string;
}

export interface BuildPackageSmokePlanOptions {
  target: ReleaseTarget;
  outputDirectory: string;
  port?: number;
}

export function buildPackageSmokePlan(options: BuildPackageSmokePlanOptions): PackageSmokePlan {
  const port = options.port || 45980;
  return {
    target: options.target,
    outputDirectory: options.outputDirectory,
    launcherPath:
      options.target === "windows-prototype"
        ? joinPath(options.outputDirectory, "start-shift-scheduler.cmd")
        : joinPath(options.outputDirectory, "start-shift-scheduler.sh"),
    port,
    expectedBaseUrl: `http://127.0.0.1:${port}`,
    dataDirectory: joinPath(options.outputDirectory, ".smoke-data"),
  };
}

function joinPath(left: string, right: string): string {
  return `${left.replace(/\/+$/, "")}/${right.replace(/^\/+/, "")}`;
}
