import { buildReleaseManifest, checkReleaseReadiness, parseReleaseTarget } from "../packaging/releaseManifest";

function main(): void {
  const linux = buildReleaseManifest({ target: "linux-prototype" });
  assertEqual(linux.target, "linux-prototype", "linux target");
  assertTrue(linux.files.some((file) => file.path.endsWith("solver/linux-x64/shift-solver")), "linux solver");
  assertTrue(linux.files.some((file) => file.path.endsWith("node/linux-x64/node")), "linux node runtime");
  assertTrue(linux.files.some((file) => file.id === "linux-dev-launcher" && file.required), "linux launcher required");

  const ready = checkReleaseReadiness(linux, {
    exists: () => true,
  });
  assertEqual(ready.ok, true, "linux ready");
  assertEqual(ready.missingRequired.length, 0, "linux missing required");

  const missingSolver = checkReleaseReadiness(linux, {
    exists: (path) => !path.includes("solver/linux-x64/shift-solver"),
  });
  assertEqual(missingSolver.ok, false, "missing solver not ready");
  assertEqual(missingSolver.missingRequired[0].id, "solver", "missing solver id");

  const windows = buildReleaseManifest({ target: "windows-prototype" });
  assertTrue(windows.files.some((file) => file.path.endsWith("solver/windows-x64/shift-solver.exe")), "windows solver");
  assertTrue(windows.files.some((file) => file.path.endsWith("node/windows-x64/node.exe")), "windows node runtime");
  assertTrue(windows.files.some((file) => file.id === "windows-dev-launcher" && file.required), "windows launcher required");
  assertTrue(windows.files.some((file) => file.id === "linux-dev-launcher" && !file.required), "linux launcher optional for windows");
  assertEqual(parseReleaseTarget("windows-prototype"), "windows-prototype", "parse windows target");
  assertThrows(() => parseReleaseTarget("unknown"), "invalid target rejected");
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertTrue(value: boolean, label: string): void {
  if (!value) {
    throw new Error(`${label}: expected true`);
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
