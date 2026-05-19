import { buildPyInstallerCommand, findSolverBuildTarget, formatCommand, parseSolverBuildPlatform } from "../solver/buildPlan";

function main(): void {
  assertEqual(parseSolverBuildPlatform(undefined), "linux-x64", "default platform");
  assertEqual(parseSolverBuildPlatform("windows-x64"), "windows-x64", "windows platform");
  assertThrows(() => parseSolverBuildPlatform("mac-x64"), "invalid platform rejected");

  const windows = buildPyInstallerCommand(findSolverBuildTarget("windows-x64"));
  assertEqual(windows.outputExecutablePath, "desktop/packaging/resources/solver/windows-x64/shift-solver.exe", "windows output");
  assertIncludes(formatCommand(windows), "--distpath desktop/packaging/resources/solver/windows-x64", "formatted distpath");
  assertIncludes(formatCommand(windows), "--collect-all ortools", "ortools binaries collected");
  assertIncludes(formatCommand(windows), "desktop/solver/pyinstaller_entry.py", "formatted entry script");
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
