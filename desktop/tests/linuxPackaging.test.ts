import { renderLinuxDesktopEntry } from "../packaging/linuxDesktopEntry";

declare const require: (name: string) => any;

const fs = require("node:fs");

function main(): void {
  const launcherPath = "desktop/packaging/linux/shift-scheduler-dev";
  assertTrue(fs.existsSync(launcherPath), "launcher exists");
  const launcher = fs.readFileSync(launcherPath, "utf8");
  assertIncludes(launcher, "desktop/app/linuxLauncher.ts", "launcher target");
  assertIncludes(launcher, "npx -y -p tsx tsx", "launcher command");

  const entry = renderLinuxDesktopEntry({
    appName: "勤務表作成",
    executablePath: "/opt/shift-scheduler/shift-scheduler",
    workingDirectory: "/opt/shift-scheduler",
    iconPath: "/opt/shift-scheduler/icon.png",
  });

  assertIncludes(entry, "[Desktop Entry]", "desktop header");
  assertIncludes(entry, "Type=Application", "desktop type");
  assertIncludes(entry, "Name=勤務表作成", "desktop name");
  assertIncludes(entry, 'Exec="/opt/shift-scheduler/shift-scheduler"', "desktop exec");
  assertIncludes(entry, "Path=/opt/shift-scheduler", "desktop path");
  assertIncludes(entry, "Terminal=false", "desktop terminal");
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
