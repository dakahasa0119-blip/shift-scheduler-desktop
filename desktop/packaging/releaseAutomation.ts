import { detectHostSolverBuildPlatform, releaseTargetForSolverPlatform } from "../solver/buildAutomation";
import type { SolverBuildPlatform } from "../solver/buildPlan";
import type { ReleaseTarget } from "./releaseManifest";

export interface ReleaseAutomationStep {
  id: "solver-build" | "node-runtime" | "readiness";
  label: string;
  executable: string;
  args: string[];
}

export interface PrepareReleasePlan {
  target: ReleaseTarget;
  solverPlatform: SolverBuildPlatform;
  steps: ReleaseAutomationStep[];
}

export interface PrepareReleasePlanOptions {
  nodePlatform: string;
  requestedTarget?: ReleaseTarget;
  force?: boolean;
}

export function detectReleaseTargetForHost(nodePlatform: string): ReleaseTarget {
  return releaseTargetForSolverPlatform(detectHostSolverBuildPlatform(nodePlatform));
}

export function solverPlatformForReleaseTarget(target: ReleaseTarget): SolverBuildPlatform {
  return target === "windows-prototype" ? "windows-x64" : "linux-x64";
}

export function buildPrepareReleasePlan(options: PrepareReleasePlanOptions): PrepareReleasePlan {
  const hostTarget = detectReleaseTargetForHost(options.nodePlatform);
  const target = options.requestedTarget || hostTarget;
  if (target !== hostTarget) {
    throw new Error(`cannot prepare ${target} on ${hostTarget} host`);
  }

  const solverPlatform = solverPlatformForReleaseTarget(target);
  const solverArgs = ["-y", "-p", "tsx", "tsx", "desktop/solver/nodeBuildSolver.ts", "--skip-readiness"];
  if (options.force) solverArgs.push("--force");

  return {
    target,
    solverPlatform,
    steps: [
      {
        id: "solver-build",
        label: "Prepare bundled solver",
        executable: "npx",
        args: solverArgs,
      },
      {
        id: "node-runtime",
        label: "Prepare bundled Node.js runtime",
        executable: "npx",
        args: ["-y", "-p", "tsx", "tsx", "desktop/packaging/nodePrepareNodeRuntime.ts", `--platform=${solverPlatform}`],
      },
      {
        id: "readiness",
        label: "Check release readiness",
        executable: "npx",
        args: ["-y", "-p", "tsx", "tsx", "desktop/packaging/nodeReleaseReadiness.ts", `--target=${target}`],
      },
    ],
  };
}
