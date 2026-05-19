import type { ReleaseTarget } from "./releaseManifest";

export interface PackageArchivePlan {
  target: ReleaseTarget;
  assembledDirectory: string;
  archivePath: string;
  checksumPath: string;
  manifestPath: string;
  archiveBaseName: string;
  verifyExtractRoot: string;
  verifyExtractedDirectory: string;
}

export interface BuildPackageArchivePlanOptions {
  target: ReleaseTarget;
  assembledDirectory: string;
  archiveRoot?: string;
  verifyRoot?: string;
}

export function buildPackageArchivePlan(options: BuildPackageArchivePlanOptions): PackageArchivePlan {
  const archiveRoot = options.archiveRoot || "/tmp/shift-scheduler-archives";
  const archiveBaseName = `shift-scheduler-${options.target}`;
  const archivePath = `${archiveRoot}/${archiveBaseName}.tar.gz`;
  const verifyExtractRoot = options.verifyRoot || "/tmp/shift-scheduler-archive-verify";
  return {
    target: options.target,
    assembledDirectory: options.assembledDirectory,
    archivePath,
    checksumPath: `${archivePath}.sha256.txt`,
    manifestPath: `${archiveRoot}/${archiveBaseName}.manifest.txt`,
    archiveBaseName,
    verifyExtractRoot,
    verifyExtractedDirectory: `${verifyExtractRoot}/${options.target}`,
  };
}

export function renderArchiveManifest(plan: PackageArchivePlan, sizeBytes: number, sha256: string): string {
  return [
    `target: ${plan.target}`,
    `archive: ${plan.archivePath}`,
    `sizeBytes: ${sizeBytes}`,
    `sha256: ${sha256}`,
    `assembledDirectory: ${plan.assembledDirectory}`,
    `verifyExtractedDirectory: ${plan.verifyExtractedDirectory}`,
    "",
  ].join("\n");
}
