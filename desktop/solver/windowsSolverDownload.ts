export interface WindowsSolverDownloadOptions {
  url: string;
  sha256?: string;
  outputPath?: string;
}

export interface WindowsSolverDownloadPlan {
  url: string;
  sha256?: string;
  outputPath: string;
  platform: "windows-x64";
}

export const defaultWindowsSolverOutputPath = "desktop/packaging/resources/solver/windows-x64/shift-solver.exe";

export function buildWindowsSolverDownloadPlan(options: WindowsSolverDownloadOptions): WindowsSolverDownloadPlan {
  const url = options.url.trim();
  if (!url) {
    throw new Error("windows solver download url is required");
  }
  if (!isAllowedSolverUrl(url)) {
    throw new Error("windows solver download url must be http, https, or file");
  }
  const sha256 = options.sha256?.trim().toLowerCase();
  if (sha256 !== undefined && !/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error("windows solver sha256 must be a 64 character hex string");
  }
  return {
    url,
    sha256,
    outputPath: options.outputPath || defaultWindowsSolverOutputPath,
    platform: "windows-x64",
  };
}

export function isAllowedSolverUrl(url: string): boolean {
  return url.startsWith("https://") || url.startsWith("http://") || url.startsWith("file://");
}
