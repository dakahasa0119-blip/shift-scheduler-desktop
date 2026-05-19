declare const require: (name: string) => any;
declare const process: {
  argv: string[];
  exitCode?: number;
};

const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function main(): void {
  const entryArg = process.argv.find((arg) => arg.startsWith("--entry="));
  const outArg = process.argv.find((arg) => arg.startsWith("--out="));
  const entryPoint = entryArg ? entryArg.replace("--entry=", "") : "desktop/app/linuxLauncher.ts";
  const outputFile = outArg ? outArg.replace("--out=", "") : "desktop/dist/shift-scheduler.cjs";

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  const result = childProcess.spawnSync(
    "npx",
    [
      "-y",
      "-p",
      "esbuild",
      "esbuild",
      entryPoint,
      "--bundle",
      "--platform=node",
      "--format=cjs",
      `--outfile=${outputFile}`,
      "--external:node:*",
    ],
    { stdio: "inherit" },
  );
  if (result.error) {
    console.error(result.error.message);
    process.exitCode = 1;
    return;
  }
  if (result.status !== 0) {
    process.exitCode = result.status || 1;
    return;
  }
  console.log(`runtime bundle: ${outputFile}`);
}

if (process.argv.some((arg) => arg.endsWith("desktop/packaging/nodeBuildRuntimeBundle.ts") || arg.endsWith("nodeBuildRuntimeBundle.ts"))) {
  main();
}

export {};
