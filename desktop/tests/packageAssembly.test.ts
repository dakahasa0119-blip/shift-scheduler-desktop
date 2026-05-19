import { buildPackageAssemblyPlan, checkPackageAssemblyPlan } from "../packaging/packageAssembly";

function main(): void {
  const linux = buildPackageAssemblyPlan({ target: "linux-prototype", outputRoot: "/tmp/out" });
  assertEqual(linux.outputDirectory, "/tmp/out/linux-prototype", "linux output");
  assertTrue(linux.entries.some((entry) => entry.source === "desktop/packaging/linux/shift-scheduler-dev"), "linux launcher");
  assertTrue(
    linux.entries.some((entry) => entry.destination === "desktop/packaging/linux/shift-scheduler-dev"),
    "linux launcher destination",
  );
  assertTrue(
    linux.entries.some((entry) => entry.destination === "desktop/packaging/resources/solver/linux-x64/shift-solver"),
    "linux solver resource",
  );
  assertTrue(linux.entries.some((entry) => entry.destination === "desktop/storage"), "storage module");

  const windows = buildPackageAssemblyPlan({ target: "windows-prototype", outputRoot: "C:/out" });
  assertTrue(
    windows.entries.some((entry) => entry.source === "desktop/packaging/windows/shift-scheduler-dev.cmd"),
    "windows launcher",
  );
  assertTrue(
    windows.entries.some((entry) => entry.destination === "desktop/packaging/windows/shift-scheduler-dev.cmd"),
    "windows launcher destination",
  );
  assertTrue(
    windows.entries.some((entry) => entry.destination === "desktop/packaging/resources/solver/windows-x64/shift-solver.exe"),
    "windows solver resource",
  );

  const ok = checkPackageAssemblyPlan(linux, { exists: () => true });
  assertEqual(ok.ok, true, "all files present");

  const missing = checkPackageAssemblyPlan(linux, {
    exists: (filePath) => !filePath.includes("resources/solver/linux-x64/shift-solver"),
  });
  assertEqual(missing.ok, false, "missing solver blocks package");
  assertTrue(missing.missingRequired[0].source.includes("resources/solver/linux-x64/shift-solver"), "missing solver source");
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
