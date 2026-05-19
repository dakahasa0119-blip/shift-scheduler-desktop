import { buildPackageSmokePlan } from "../packaging/packageSmoke";

function main(): void {
  const linux = buildPackageSmokePlan({
    target: "linux-prototype",
    outputDirectory: "/tmp/release/shift-scheduler-linux-x64",
    port: 45981,
  });
  assertEqual(linux.launcherPath, "/tmp/release/shift-scheduler-linux-x64/start-shift-scheduler.sh", "linux launcher");
  assertEqual(linux.expectedBaseUrl, "http://127.0.0.1:45981", "linux url");
  assertEqual(linux.dataDirectory, "/tmp/release/shift-scheduler-linux-x64/.smoke-data", "linux data directory");

  const windows = buildPackageSmokePlan({
    target: "windows-prototype",
    outputDirectory: "C:/release/shift-scheduler-windows-x64",
  });
  assertEqual(
    windows.launcherPath,
    "C:/release/shift-scheduler-windows-x64/start-shift-scheduler.cmd",
    "windows launcher",
  );
  assertEqual(windows.expectedBaseUrl, "http://127.0.0.1:45980", "default url");
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

main();
