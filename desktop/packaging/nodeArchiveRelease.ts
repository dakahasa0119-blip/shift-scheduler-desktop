import { buildPackageArchivePlan, renderArchiveManifest } from "./packageArchive";
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
  const force = process.argv.includes("--force");
  const skipVerify = process.argv.includes("--skip-verify");
  const skipPrepare = process.argv.includes("--skip-prepare");
  const skipSmoke = process.argv.includes("--skip-smoke");
  let target: ReleaseTarget | undefined;
  try {
    target = targetArg ? parseReleaseTarget(targetArg.replace("--target=", "")) : undefined;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  const releaseTarget = resolveReleaseTarget(target);

  const assembleArgs = [
    "-y",
    "-p",
    "tsx",
    "tsx",
    "desktop/packaging/nodeAssembleRelease.ts",
    `--target=${releaseTarget}`,
  ];
  if (outputArg) assembleArgs.push(outputArg);
  if (force) assembleArgs.push("--force");
  if (skipPrepare) assembleArgs.push("--skip-prepare");
  if (skipSmoke) assembleArgs.push("--skip-smoke");
  const assemble = childProcess.spawnSync("npx", assembleArgs, {
    stdio: "inherit",
  });
  if (assemble.error) {
    console.error(assemble.error.message);
    process.exitCode = 1;
    return;
  }
  if (assemble.status !== 0) {
    process.exitCode = assemble.status || 1;
    return;
  }

  const assemblyPlan = buildPackageAssemblyPlan({
    target: releaseTarget,
    outputRoot: outputArg ? outputArg.replace("--out=", "") : undefined,
  });
  const archivePlan = buildPackageArchivePlan({
    target: releaseTarget,
    assembledDirectory: assemblyPlan.outputDirectory,
    archiveRoot: archiveOutArg ? archiveOutArg.replace("--archive-out=", "") : undefined,
    verifyRoot: verifyOutArg ? verifyOutArg.replace("--verify-out=", "") : undefined,
  });
  fs.mkdirSync(path.dirname(archivePlan.archivePath), { recursive: true });
  fs.rmSync(archivePlan.archivePath, { force: true });
  fs.rmSync(archivePlan.checksumPath, { force: true });
  fs.rmSync(archivePlan.manifestPath, { force: true });

  const tar = childProcess.spawnSync(
    "tar",
    ["-czf", archivePlan.archivePath, "-C", path.dirname(archivePlan.assembledDirectory), path.basename(archivePlan.assembledDirectory)],
    { stdio: "inherit" },
  );
  if (tar.error) {
    console.error(tar.error.message);
    process.exitCode = 1;
    return;
  }
  if (tar.status !== 0) {
    process.exitCode = tar.status || 1;
    return;
  }

  const sha256 = sha256File(archivePlan.archivePath);
  const sizeBytes = fs.statSync(archivePlan.archivePath).size;
  fs.writeFileSync(archivePlan.checksumPath, `${sha256}  ${path.basename(archivePlan.archivePath)}\n`, "utf8");
  fs.writeFileSync(archivePlan.manifestPath, renderArchiveManifest(archivePlan, sizeBytes, sha256), "utf8");
  console.log(`archive: ${archivePlan.archivePath}`);
  console.log(`sha256: ${sha256}`);
  console.log(`manifest: ${archivePlan.manifestPath}`);

  if (!skipVerify) {
    const verifyArgs = [
      "-y",
      "-p",
      "tsx",
      "tsx",
      "desktop/packaging/nodeVerifyArchiveRelease.ts",
      `--target=${releaseTarget}`,
    ];
    if (outputArg) verifyArgs.push(outputArg);
    if (archiveOutArg) verifyArgs.push(archiveOutArg);
    if (verifyOutArg) verifyArgs.push(verifyOutArg);
    const verify = childProcess.spawnSync("npx", verifyArgs, {
      stdio: "inherit",
    });
    if (verify.error) {
      console.error(verify.error.message);
      process.exitCode = 1;
      return;
    }
    if (verify.status !== 0) {
      process.exitCode = verify.status || 1;
    }
  }
}

function resolveReleaseTarget(target: ReleaseTarget | undefined): ReleaseTarget {
  if (target) return target;
  return buildPrepareReleasePlan({ nodePlatform: process.platform }).target;
}

function sha256File(filePath: string): string {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

if (process.argv.some((arg) => arg.endsWith("desktop/packaging/nodeArchiveRelease.ts") || arg.endsWith("nodeArchiveRelease.ts"))) {
  main();
}
