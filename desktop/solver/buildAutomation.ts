import {
  buildPyInstallerCommand,
  findSolverBuildTarget,
  type SolverBuildCommand,
  type SolverBuildPlatform,
} from "./buildPlan";
import type { ReleaseTarget } from "../packaging/releaseManifest";

export interface SolverBuildAutomationPlan {
  platform: SolverBuildPlatform;
  releaseTarget: ReleaseTarget;
  command: SolverBuildCommand;
  shouldBuild: boolean;
  reason: string;
}

export interface SolverBuildAutomationOptions {
  nodePlatform: string;
  requestedPlatform?: SolverBuildPlatform;
  force?: boolean;
  artifactExists: boolean;
}

export function detectHostSolverBuildPlatform(nodePlatform: string): SolverBuildPlatform {
  if (nodePlatform === "win32") return "windows-x64";
  if (nodePlatform === "linux") return "linux-x64";
  throw new Error(`unsupported solver build host: ${nodePlatform}`);
}

export function releaseTargetForSolverPlatform(platform: SolverBuildPlatform): ReleaseTarget {
  return platform === "windows-x64" ? "windows-prototype" : "linux-prototype";
}

export function buildSolverAutomationPlan(options: SolverBuildAutomationOptions): SolverBuildAutomationPlan {
  const platform = options.requestedPlatform || detectHostSolverBuildPlatform(options.nodePlatform);
  const command = buildPyInstallerCommand(findSolverBuildTarget(platform));
  const shouldBuild = options.force === true || !options.artifactExists;
  return {
    platform,
    releaseTarget: releaseTargetForSolverPlatform(platform),
    command,
    shouldBuild,
    reason: shouldBuild ? "solver artifact will be built" : "solver artifact already exists",
  };
}
