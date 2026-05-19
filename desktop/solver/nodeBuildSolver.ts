import { buildSolverAutomationPlan, detectHostSolverBuildPlatform } from "./buildAutomation";
import { parseSolverBuildPlatform, type SolverBuildPlatform } from "./buildPlan";
import { checkReleaseReadiness, buildReleaseManifest, type ReleaseTarget } from "../packaging/releaseManifest";

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
  const platformArg = process.argv.find((arg) => arg.startsWith("--platform="));
  const force = process.argv.includes("--force");
  let requestedPlatform: SolverBuildPlatform | undefined;
  try {
    requestedPlatform = platformArg ? parseSolverBuildPlatform(platformArg.replace("--platform=", "")) : undefined;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  let hostPlatform: SolverBuildPlatform;
  try {
    hostPlatform = detectHostSolverBuildPlatform(process.platform);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }
  if (requestedPlatform && requestedPlatform !== hostPlatform) {
    console.error(`cannot build ${requestedPlatform} solver on ${hostPlatform} host`);
    process.exitCode = 1;
    return;
  }

  let plan;
  try {
    plan = buildSolverAutomationPlan({
      nodePlatform: process.platform,
      requestedPlatform,
      force,
      artifactExists: fs.existsSync(requestedPlatform ? commandOutputPath(requestedPlatform) : ""),
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  const outputPath = plan.command.outputExecutablePath;
  const existing = fs.existsSync(outputPath);
  const actualPlan = buildSolverAutomationPlan({
    nodePlatform: process.platform,
    requestedPlatform: plan.platform,
    force,
    artifactExists: existing,
  });

  console.log(`platform: ${actualPlan.platform}`);
  console.log(`output: ${outputPath}`);
  if (!actualPlan.shouldBuild) {
    console.log("build: skipped");
    printReadiness(actualPlan.releaseTarget);
    return;
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  console.log("build: started");
  const result = childProcess.spawnSync(actualPlan.command.executable, actualPlan.command.args, {
    stdio: "inherit",
  });
  if (result.error) {
    console.error(result.error.message);
    process.exitCode = 1;
    return;
  }
  if (result.status !== 0) {
    process.exitCode = result.status || 1;
    return;
  }
  if (!fs.existsSync(outputPath)) {
    console.error(`build output missing: ${outputPath}`);
    process.exitCode = 1;
    return;
  }
  if (actualPlan.platform === "linux-x64") {
    fs.chmodSync(outputPath, 0o755);
  }
  console.log("build: completed");
  printReadiness(actualPlan.releaseTarget);
}

function commandOutputPath(platform: SolverBuildPlatform): string {
  return platform === "windows-x64"
    ? "desktop/packaging/resources/solver/windows-x64/shift-solver.exe"
    : "desktop/packaging/resources/solver/linux-x64/shift-solver";
}

function printReadiness(target: ReleaseTarget): void {
  const result = checkReleaseReadiness(buildReleaseManifest({ target }), {
    exists: (filePath) => fs.existsSync(filePath),
  });
  console.log(`release target: ${target}`);
  console.log(`ready: ${result.ok ? "yes" : "no"}`);
  result.missingRequired.forEach((item) => console.log(`missing required: ${item.path} (${item.description})`));
  if (!result.ok) process.exitCode = 1;
}

if (process.argv.some((arg) => arg.endsWith("desktop/solver/nodeBuildSolver.ts") || arg.endsWith("nodeBuildSolver.ts"))) {
  main();
}
