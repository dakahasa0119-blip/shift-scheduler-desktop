import { buildPackageSmokePlan } from "../packaging/packageSmoke";

function main(): void {
  const linux = buildPackageSmokePlan({
    target: "linux-prototype",
    outputDirectory: "/tmp/release/linux-prototype",
    port: 45981,
  });
  assertEqual(linux.launcherPath, "/tmp/release/linux-prototype/desktop/packaging/linux/shift-scheduler-dev", "linux launcher");
  assertEqual(linux.expectedBaseUrl, "http://127.0.0.1:45981", "linux url");
  assertEqual(linux.dataDirectory, "/tmp/release/linux-prototype/.smoke-data", "linux data directory");

  const windows = buildPackageSmokePlan({
    target: "windows-prototype",
    outputDirectory: "C:/release/windows-prototype",
  });
  assertEqual(
    windows.launcherPath,
    "C:/release/windows-prototype/desktop/packaging/windows/shift-scheduler-dev.cmd",
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
