export interface LinuxDesktopEntryOptions {
  appName: string;
  executablePath: string;
  workingDirectory: string;
  iconPath?: string;
  comment?: string;
}

export function renderLinuxDesktopEntry(options: LinuxDesktopEntryOptions): string {
  return [
    "[Desktop Entry]",
    "Type=Application",
    `Name=${escapeDesktopValue(options.appName)}`,
    `Comment=${escapeDesktopValue(options.comment || "勤務表作成")}`,
    `Exec=${quoteExec(options.executablePath)}`,
    `Path=${escapeDesktopValue(options.workingDirectory)}`,
    options.iconPath ? `Icon=${escapeDesktopValue(options.iconPath)}` : "",
    "Terminal=false",
    "Categories=Office;",
    "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function quoteExec(value: string): string {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function escapeDesktopValue(value: string): string {
  return String(value).replace(/\n/g, " ").trim();
}
