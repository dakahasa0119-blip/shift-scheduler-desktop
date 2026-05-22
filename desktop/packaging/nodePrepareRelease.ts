import { buildPrepareReleasePlan } from "./releaseAutomation";
import { parseReleaseTarget, type ReleaseTarget } from "./releaseManifest";

declare const require: (name: string) => any;
declare const process: {
  argv: string[];
  platform: string;
  exitCode?: number;
};

const childProcess = require("node:child_process");

function main(): void {
  const targetArg = process.argv.find((arg) => arg.startsWith("--target="));
  const force = process.argv.includes("--force");
  let target: ReleaseTarget | undefined;
  try {
    target = targetArg ? parseReleaseTarget(targetArg.replace("--target=", "")) : undefined;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  let plan;
  try {
    plan = buildPrepareReleasePlan({
      nodePlatform: process.platform,
      requestedTarget: target,
      force,
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  console.log(`release target: ${plan.target}`);
  console.log(`solver platform: ${plan.solverPlatform}`);
  for (const step of plan.steps) {
    console.log(`step: ${step.label}`);
    const result = childProcess.spawnSync(resolveExecutable(step.executable), step.args, {
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
  }
  console.log("prepare release: completed");
}

function resolveExecutable(executable: string): string {
  if (process.platform === "win32" && executable === "npx") return "npx.cmd";
  return executable;
}

if (process.argv.some((arg) => arg.endsWith("desktop/packaging/nodePrepareRelease.ts") || arg.endsWith("nodePrepareRelease.ts"))) {
  main();
}
