import { buildPackageAssemblyPlan, checkPackageAssemblyPlan } from "./packageAssembly";
import { buildPrepareReleasePlan } from "./releaseAutomation";
import { parseReleaseTarget, type ReleaseTarget } from "./releaseManifest";

declare const require: (name: string) => any;
declare const process: {
  argv: string[];
  platform: string;
  exitCode?: number;
};

const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function main(): void {
  const targetArg = process.argv.find((arg) => arg.startsWith("--target="));
  const outputArg = process.argv.find((arg) => arg.startsWith("--out="));
  const force = process.argv.includes("--force");
  const skipSmoke = process.argv.includes("--skip-smoke");
  const skipPrepare = process.argv.includes("--skip-prepare");
  let target: ReleaseTarget | undefined;
  try {
    target = targetArg ? parseReleaseTarget(targetArg.replace("--target=", "")) : undefined;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  const releaseTarget = resolveReleaseTarget(target);
  if (!skipPrepare) {
    const prepared = prepareRelease(target, force);
    if (!prepared) return;
  } else {
    const readiness = childProcess.spawnSync(
      "npx",
      ["-y", "-p", "tsx", "tsx", "desktop/packaging/nodeReleaseReadiness.ts", `--target=${releaseTarget}`],
      { stdio: "inherit" },
    );
    if (readiness.error) {
      console.error(readiness.error.message);
      process.exitCode = 1;
      return;
    }
    if (readiness.status !== 0) {
      process.exitCode = readiness.status || 1;
      return;
    }
  }

  const plan = buildPackageAssemblyPlan({
    target: releaseTarget,
    outputRoot: outputArg ? outputArg.replace("--out=", "") : undefined,
  });
  const check = checkPackageAssemblyPlan(plan, {
    exists: (filePath) => fs.existsSync(filePath),
  });
  if (!check.ok) {
    check.missingRequired.forEach((entry) => console.error(`missing required: ${entry.source}`));
    process.exitCode = 1;
    return;
  }

  fs.rmSync(plan.outputDirectory, { recursive: true, force: true });
  fs.mkdirSync(plan.outputDirectory, { recursive: true });
  for (const entry of plan.entries) {
    const destination = path.join(plan.outputDirectory, entry.destination);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.cpSync(entry.source, destination, { recursive: true });
  }
  console.log(`assembled: ${plan.outputDirectory}`);

  if (!skipSmoke) {
    const smokeArgs = [
      "-y",
      "-p",
      "tsx",
      "tsx",
      "desktop/packaging/nodeSmokeAssembledRelease.ts",
      `--target=${releaseTarget}`,
    ];
    if (outputArg) smokeArgs.push(outputArg);
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
    }
  }
}

function resolveReleaseTarget(target: ReleaseTarget | undefined): ReleaseTarget {
  if (target) return target;
  return buildPrepareReleasePlan({ nodePlatform: process.platform }).target;
}

function prepareRelease(target: ReleaseTarget | undefined, force: boolean): boolean {
  let releasePlan;
  try {
    releasePlan = buildPrepareReleasePlan({
      nodePlatform: process.platform,
      requestedTarget: target,
      force,
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return false;
  }

  const prepareArgs = [
    "-y",
    "-p",
    "tsx",
    "tsx",
    "desktop/packaging/nodePrepareRelease.ts",
    `--target=${releasePlan.target}`,
  ];
  if (force) prepareArgs.push("--force");
  const prepare = childProcess.spawnSync("npx", prepareArgs, {
    stdio: "inherit",
  });
  if (prepare.error) {
    console.error(prepare.error.message);
    process.exitCode = 1;
    return false;
  }
  if (prepare.status !== 0) {
    process.exitCode = prepare.status || 1;
    return false;
  }
  return true;
}

if (process.argv.some((arg) => arg.endsWith("desktop/packaging/nodeAssembleRelease.ts") || arg.endsWith("nodeAssembleRelease.ts"))) {
  main();
}
