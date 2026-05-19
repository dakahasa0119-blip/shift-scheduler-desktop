import { buildPyInstallerCommand, initialSolverBuildTargets } from "../solver/buildPlan";

function main(): void {
  const linux = buildPyInstallerCommand(initialSolverBuildTargets[0]);
  assertEqual(linux.executable, "pyinstaller", "linux builder executable");
  assertTrue(linux.args.includes("--onefile"), "linux onefile flag");
  assertEqual(linux.outputExecutablePath, "desktop/packaging/resources/solver/linux-x64/shift-solver", "linux output path");

  const windows = buildPyInstallerCommand(initialSolverBuildTargets[1]);
  assertEqual(windows.args[windows.args.indexOf("--name") + 1], "shift-solver", "windows pyinstaller name");
  assertEqual(
    windows.outputExecutablePath,
    "desktop/packaging/resources/solver/windows-x64/shift-solver.exe",
    "windows output path",
  );
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

main();
