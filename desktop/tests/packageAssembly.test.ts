import { buildPackageAssemblyPlan, checkPackageAssemblyPlan } from "../packaging/packageAssembly";

function main(): void {
  const linux = buildPackageAssemblyPlan({ target: "linux-prototype", outputRoot: "/tmp/out" });
  assertEqual(linux.outputDirectory, "/tmp/out/shift-scheduler-linux-x64", "linux output");
  assertTrue(linux.entries.some((entry) => entry.source === "desktop/packaging/linux/start-shift-scheduler.sh"), "linux launcher");
  assertTrue(
    linux.entries.some((entry) => entry.destination === "start-shift-scheduler.sh"),
    "linux launcher destination",
  );
  assertTrue(
    linux.entries.some((entry) => entry.destination === "desktop/packaging/resources/solver/linux-x64/shift-solver"),
    "linux solver resource",
  );
  assertTrue(linux.entries.some((entry) => entry.destination === "desktop/dist/shift-scheduler.cjs"), "runtime bundle");
  assertTrue(linux.entries.some((entry) => entry.destination === "desktop/packaging/runtime/node"), "node runtime");
  assertTrue(linux.entries.some((entry) => entry.destination === "README.txt"), "start here readme");
  assertTrue(linux.entries.some((entry) => entry.destination === "SUPPORT_INFO.txt"), "support info");
  assertTrue(linux.entries.some((entry) => entry.destination === "docs/user-guide.md"), "user guide");
  assertTrue(linux.entries.some((entry) => entry.destination === "docs/release-notes.md"), "release notes");
  assertEqual(linux.entries.some((entry) => entry.destination === "docs/migration-plan.md"), false, "migration doc excluded");
  assertEqual(linux.entries.some((entry) => entry.destination === "docs/packaging.md"), false, "packaging doc excluded");
  assertEqual(linux.entries.some((entry) => entry.destination.startsWith("desktop/app/")), false, "app source excluded");
  assertEqual(linux.entries.some((entry) => entry.destination.startsWith("desktop/api/")), false, "api source excluded");
  assertEqual(linux.entries.some((entry) => entry.destination.includes("mockSolverRunner")), false, "mock solver excluded");
  assertEqual(linux.entries.some((entry) => entry.destination.includes("previewServer")), false, "preview server excluded");

  const windows = buildPackageAssemblyPlan({ target: "windows-prototype", outputRoot: "C:/out" });
  assertTrue(
    windows.entries.some((entry) => entry.source === "desktop/packaging/windows/start-shift-scheduler.cmd"),
    "windows command launcher",
  );
  assertTrue(
    windows.entries.some((entry) => entry.destination === "start-shift-scheduler.cmd"),
    "windows command launcher destination",
  );
  assertTrue(
    windows.entries.some((entry) => entry.destination === "start-shift-scheduler.vbs"),
    "windows hidden launcher destination",
  );
  assertTrue(
    windows.entries.some((entry) => entry.destination === "desktop/packaging/resources/solver/windows-x64/shift-solver.exe"),
    "windows solver resource",
  );
  assertTrue(
    windows.entries.some((entry) => entry.destination === "desktop/packaging/runtime/node.exe"),
    "windows node runtime",
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
