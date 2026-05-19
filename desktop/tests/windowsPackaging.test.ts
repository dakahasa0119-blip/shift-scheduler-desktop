declare const require: (name: string) => any;

const fs = require("node:fs");

function main(): void {
  const launcherPath = "desktop/packaging/windows/shift-scheduler-dev.cmd";
  assertTrue(fs.existsSync(launcherPath), "windows launcher exists");
  const launcher = fs.readFileSync(launcherPath, "utf8");
  assertIncludes(launcher, "desktop/app/windowsLauncher.ts", "windows launcher target");
  assertIncludes(launcher, "npx -y -p tsx tsx", "launcher command");
}

function assertIncludes(text: string, expected: string, label: string): void {
  if (!text.includes(expected)) {
    throw new Error(`${label}: missing ${expected}`);
  }
}

function assertTrue(value: boolean, label: string): void {
  if (!value) {
    throw new Error(`${label}: expected true`);
  }
}

main();
