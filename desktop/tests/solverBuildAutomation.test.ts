import {
  buildSolverAutomationPlan,
  detectHostSolverBuildPlatform,
  releaseTargetForSolverPlatform,
} from "../solver/buildAutomation";

function main(): void {
  assertEqual(detectHostSolverBuildPlatform("linux"), "linux-x64", "linux host");
  assertEqual(detectHostSolverBuildPlatform("win32"), "windows-x64", "windows host");
  assertThrows(() => detectHostSolverBuildPlatform("darwin"), "unsupported host");
  assertEqual(releaseTargetForSolverPlatform("windows-x64"), "windows-prototype", "windows release target");

  const existing = buildSolverAutomationPlan({
    nodePlatform: "linux",
    artifactExists: true,
  });
  assertEqual(existing.platform, "linux-x64", "auto linux platform");
  assertEqual(existing.shouldBuild, false, "skip existing artifact");
  assertEqual(existing.releaseTarget, "linux-prototype", "linux release target");

  const missingWindows = buildSolverAutomationPlan({
    nodePlatform: "win32",
    artifactExists: false,
  });
  assertEqual(missingWindows.platform, "windows-x64", "auto windows platform");
  assertEqual(missingWindows.shouldBuild, true, "build missing artifact");
  assertEqual(
    missingWindows.command.outputExecutablePath,
    "desktop/packaging/resources/solver/windows-x64/shift-solver.exe",
    "windows output path",
  );

  const forced = buildSolverAutomationPlan({
    nodePlatform: "linux",
    artifactExists: true,
    force: true,
  });
  assertEqual(forced.shouldBuild, true, "force rebuild");
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertThrows(fn: () => void, label: string): void {
  try {
    fn();
  } catch {
    return;
  }
  throw new Error(`${label}: expected throw`);
}

main();
