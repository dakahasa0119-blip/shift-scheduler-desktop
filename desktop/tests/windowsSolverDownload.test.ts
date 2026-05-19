import {
  buildWindowsSolverDownloadPlan,
  defaultWindowsSolverOutputPath,
  isAllowedSolverUrl,
} from "../solver/windowsSolverDownload";

function main(): void {
  const plan = buildWindowsSolverDownloadPlan({
    url: "https://example.test/shift-solver.exe",
    sha256: "a".repeat(64),
  });
  assertEqual(plan.platform, "windows-x64", "platform");
  assertEqual(plan.outputPath, defaultWindowsSolverOutputPath, "default output");
  assertEqual(plan.sha256, "a".repeat(64), "sha256");

  assertEqual(isAllowedSolverUrl("file:///tmp/shift-solver.exe"), true, "file url");
  assertEqual(isAllowedSolverUrl("ftp://example.test/shift-solver.exe"), false, "ftp rejected");
  assertThrows(() => buildWindowsSolverDownloadPlan({ url: "" }), "empty url rejected");
  assertThrows(() => buildWindowsSolverDownloadPlan({ url: "ftp://example.test/shift-solver.exe" }), "bad scheme rejected");
  assertThrows(() => buildWindowsSolverDownloadPlan({ url: "https://example.test/shift-solver.exe", sha256: "bad" }), "bad hash rejected");
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
