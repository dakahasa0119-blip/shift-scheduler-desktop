import { buildPackageArchivePlan } from "./packageArchive";
import { buildPackageAssemblyPlan } from "./packageAssembly";
import { buildPrepareReleasePlan } from "./releaseAutomation";
import { parseReleaseTarget, type ReleaseTarget } from "./releaseManifest";

declare const require: (name: string) => any;
declare const process: {
  argv: string[];
  platform: string;
  exitCode?: number;
};

const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function main(): void {
  const targetArg = process.argv.find((arg) => arg.startsWith("--target="));
  const outputArg = process.argv.find((arg) => arg.startsWith("--out="));
  const archiveOutArg = process.argv.find((arg) => arg.startsWith("--archive-out="));
  const verifyOutArg = process.argv.find((arg) => arg.startsWith("--verify-out="));
  let target: ReleaseTarget | undefined;
  try {
    target = targetArg ? parseReleaseTarget(targetArg.replace("--target=", "")) : undefined;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  let releasePlan;
  try {
    releasePlan = buildPrepareReleasePlan({
      nodePlatform: process.platform,
      requestedTarget: target,
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  const assemblyPlan = buildPackageAssemblyPlan({
    target: releasePlan.target,
    outputRoot: outputArg ? outputArg.replace("--out=", "") : undefined,
  });
  const archivePlan = buildPackageArchivePlan({
    target: releasePlan.target,
    assembledDirectory: assemblyPlan.outputDirectory,
    archiveRoot: archiveOutArg ? archiveOutArg.replace("--archive-out=", "") : undefined,
    verifyRoot: verifyOutArg ? verifyOutArg.replace("--verify-out=", "") : undefined,
  });

  if (!fs.existsSync(archivePlan.archivePath)) {
    console.error(`archive missing: ${archivePlan.archivePath}`);
    process.exitCode = 1;
    return;
  }
  if (!fs.existsSync(archivePlan.checksumPath)) {
    console.error(`checksum missing: ${archivePlan.checksumPath}`);
    process.exitCode = 1;
    return;
  }

  const expectedChecksum = fs.readFileSync(archivePlan.checksumPath, "utf8").trim().split(/\s+/)[0];
  const actualChecksum = sha256File(archivePlan.archivePath);
  if (actualChecksum !== expectedChecksum) {
    console.error(`checksum mismatch: ${archivePlan.archivePath}`);
    process.exitCode = 1;
    return;
  }

  fs.rmSync(archivePlan.verifyExtractRoot, { recursive: true, force: true });
  fs.mkdirSync(archivePlan.verifyExtractRoot, { recursive: true });
  const tar = childProcess.spawnSync("tar", ["-xzf", archivePlan.archivePath, "-C", archivePlan.verifyExtractRoot], {
    stdio: "inherit",
  });
  if (tar.error) {
    console.error(tar.error.message);
    process.exitCode = 1;
    return;
  }
  if (tar.status !== 0) {
    process.exitCode = tar.status || 1;
    return;
  }
  const launcherPath =
    releasePlan.target === "windows-prototype"
      ? path.join(archivePlan.verifyExtractedDirectory, "desktop/packaging/windows/shift-scheduler-dev.cmd")
      : path.join(archivePlan.verifyExtractedDirectory, "desktop/packaging/linux/shift-scheduler-dev");
  if (!fs.existsSync(launcherPath)) {
    console.error(`extracted launcher missing: ${archivePlan.verifyExtractedDirectory}`);
    process.exitCode = 1;
    return;
  }

  const smokeArgs = [
    "-y",
    "-p",
    "tsx",
    "tsx",
    "desktop/packaging/nodeSmokeAssembledRelease.ts",
    `--target=${releasePlan.target}`,
    `--out=${archivePlan.verifyExtractRoot}`,
    "--port=45982",
  ];
  const smoke = childProcess.spawnSync("npx", smokeArgs, {
    stdio: "inherit",
  });
  if (smoke.error) {
    console.error(smoke.error.message);
    process.exitCode = 1;
    return;
  }
  if (smoke.status !== 0) {
    process.exitCode = smoke.status || 1;
    return;
  }
  console.log(`archive verified: ${archivePlan.archivePath}`);
}

function sha256File(filePath: string): string {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

if (process.argv.some((arg) => arg.endsWith("desktop/packaging/nodeVerifyArchiveRelease.ts") || arg.endsWith("nodeVerifyArchiveRelease.ts"))) {
  main();
}
