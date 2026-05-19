import { initialBundledSolverManifest, resolveBundledSolverRuntimeConfig } from "../solver/manifest";

function main(): void {
  const linux = resolveBundledSolverRuntimeConfig({
    manifest: initialBundledSolverManifest,
    platform: "linux-x64",
    resourceRoot: "/app/resources",
    workDirectory: "/tmp/work",
    supportLogDirectory: "/tmp/logs",
    keepDebugFiles: false,
    defaultTimeLimitSeconds: 120,
    joinPath: (...parts) => parts.join("/"),
  });

  assertEqual(linux.executablePath, "/app/resources/solver/linux-x64/shift-solver", "linux executable path");
  assertEqual(linux.platform, "linux-x64", "linux platform");

  const windows = resolveBundledSolverRuntimeConfig({
    manifest: initialBundledSolverManifest,
    platform: "windows-x64",
    resourceRoot: "C:/App/resources",
    workDirectory: "C:/Temp/work",
    supportLogDirectory: "C:/Temp/logs",
    keepDebugFiles: true,
    defaultTimeLimitSeconds: 180,
    joinPath: (...parts) => parts.join("/"),
  });

  assertEqual(windows.executablePath, "C:/App/resources/solver/windows-x64/shift-solver.exe", "windows executable path");
  assertEqual(windows.keepDebugFiles, true, "debug setting");
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

main();
