declare const require: (name: string) => any;
declare const process: {
  argv: string[];
  exitCode?: number;
};

const childProcess = require("node:child_process");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

type NodeRuntimePlatform = "linux-x64" | "windows-x64";

const nodeVersion = "24.11.1";

async function main(): Promise<void> {
  const platformArg = process.argv.find((arg) => arg.startsWith("--platform="));
  const platform = parsePlatform(platformArg ? platformArg.replace("--platform=", "") : undefined);
  const outputPath = platform === "windows-x64"
    ? "desktop/packaging/resources/node/windows-x64/node.exe"
    : "desktop/packaging/resources/node/linux-x64/node";
  if (fs.existsSync(outputPath)) {
    console.log(`node runtime: ${outputPath}`);
    console.log("download: skipped");
    return;
  }

  await fsp.mkdir(path.dirname(outputPath), { recursive: true });
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), `shift-node-${platform}-`));
  try {
    if (platform === "windows-x64") {
      await prepareWindowsNode(tempDir, outputPath);
    } else {
      await prepareLinuxNode(tempDir, outputPath);
    }
    console.log(`node runtime: ${outputPath}`);
  } finally {
    await fsp.rm(tempDir, { recursive: true, force: true });
  }
}

function parsePlatform(value: string | undefined): NodeRuntimePlatform {
  if (value === "windows-x64" || value === "linux-x64") return value;
  if (!value) return "linux-x64";
  throw new Error(`unknown node runtime platform: ${value}`);
}

async function prepareWindowsNode(tempDir: string, outputPath: string): Promise<void> {
  const archive = path.join(tempDir, "node.zip");
  await downloadFile(`https://nodejs.org/dist/v${nodeVersion}/node-v${nodeVersion}-win-x64.zip`, archive);
  const extractDir = path.join(tempDir, "extract");
  await fsp.mkdir(extractDir, { recursive: true });
  run(pythonExecutable(), ["-m", "zipfile", "-e", archive, extractDir]);
  await fsp.copyFile(path.join(extractDir, `node-v${nodeVersion}-win-x64`, "node.exe"), outputPath);
}

async function prepareLinuxNode(tempDir: string, outputPath: string): Promise<void> {
  const archive = path.join(tempDir, "node.tar.xz");
  await downloadFile(`https://nodejs.org/dist/v${nodeVersion}/node-v${nodeVersion}-linux-x64.tar.xz`, archive);
  const extractDir = path.join(tempDir, "extract");
  await fsp.mkdir(extractDir, { recursive: true });
  run("tar", ["-xJf", archive, "-C", extractDir]);
  await fsp.copyFile(path.join(extractDir, `node-v${nodeVersion}-linux-x64`, "bin", "node"), outputPath);
  await fsp.chmod(outputPath, 0o755);
}

async function downloadFile(url: string, outputPath: string): Promise<void> {
  const result = childProcess.spawnSync("curl", ["-fL", url, "-o", outputPath], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`download failed: ${url}`);
}

function run(executable: string, args: string[]): void {
  const result = childProcess.spawnSync(executable, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${executable} failed`);
}

function pythonExecutable(): string {
  return process.platform === "win32" ? "python" : "python3";
}

if (process.argv.some((arg) => arg.endsWith("desktop/packaging/nodePrepareNodeRuntime.ts") || arg.endsWith("nodePrepareNodeRuntime.ts"))) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

export {};
