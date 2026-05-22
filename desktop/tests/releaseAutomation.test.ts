import {
  buildPrepareReleasePlan,
  detectReleaseTargetForHost,
  solverPlatformForReleaseTarget,
} from "../packaging/releaseAutomation";

function main(): void {
  assertEqual(detectReleaseTargetForHost("linux"), "linux-prototype", "linux host target");
  assertEqual(detectReleaseTargetForHost("win32"), "windows-prototype", "windows host target");
  assertEqual(solverPlatformForReleaseTarget("windows-prototype"), "windows-x64", "windows solver platform");

  const linux = buildPrepareReleasePlan({ nodePlatform: "linux" });
  assertEqual(linux.target, "linux-prototype", "linux target");
  assertEqual(linux.solverPlatform, "linux-x64", "linux solver");
  assertEqual(linux.steps[0].id, "solver-build", "first step");
  assertIncludes(linux.steps[0].args.join(" "), "desktop/solver/nodeBuildSolver.ts", "solver step");
  assertIncludes(linux.steps[0].args.join(" "), "--skip-readiness", "solver readiness deferred");
  assertEqual(linux.steps[1].id, "node-runtime", "second step");
  assertIncludes(linux.steps[1].args.join(" "), "desktop/packaging/nodePrepareNodeRuntime.ts", "node runtime step");
  assertIncludes(linux.steps[1].args.join(" "), "--platform=linux-x64", "node runtime platform");
  assertIncludes(linux.steps[2].args.join(" "), "--target=linux-prototype", "readiness target");

  const forced = buildPrepareReleasePlan({ nodePlatform: "linux", force: true });
  assertIncludes(forced.steps[0].args.join(" "), "--force", "force solver build");

  assertThrows(() => buildPrepareReleasePlan({ nodePlatform: "linux", requestedTarget: "windows-prototype" }), "cross target");
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertIncludes(text: string, expected: string, label: string): void {
  if (!text.includes(expected)) {
    throw new Error(`${label}: missing ${expected}`);
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
