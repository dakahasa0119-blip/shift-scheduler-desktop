import { buildWindowsSolverDownloadPlan } from "./windowsSolverDownload";
import { buildReleaseManifest, checkReleaseReadiness } from "../packaging/releaseManifest";

declare const require: (name: string) => any;
declare const process: {
  argv: string[];
  exitCode?: number;
};
declare const Buffer: {
  concat(chunks: Uint8Array[]): Uint8Array;
};

const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");

async function main(): Promise<void> {
  const url = readArg("--url=") || process.argv[2] || "";
  const sha256 = readArg("--sha256=");
  let plan;
  try {
    plan = buildWindowsSolverDownloadPlan({ url, sha256 });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  console.log(`download: ${plan.url}`);
  console.log(`output: ${plan.outputPath}`);
  await fsp.mkdir(path.dirname(plan.outputPath), { recursive: true });

  const bytes = await readBytes(plan.url);
  const actualSha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  console.log(`sha256: ${actualSha256}`);
  if (plan.sha256 && actualSha256 !== plan.sha256) {
    console.error("sha256 mismatch; downloaded solver was not written");
    process.exitCode = 1;
    return;
  }

  await fsp.writeFile(plan.outputPath, bytes);
  console.log("download: completed");
  printReadiness();
}

function readArg(prefix: string): string | undefined {
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function readBytes(url: string): Promise<Uint8Array> {
  if (url.startsWith("file://")) {
    return fsp.readFile(new URL(url));
  }
  return downloadBytes(url);
}

async function downloadBytes(url: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https://") ? https : http;
    const request = client.get(url, (response: any) => {
      const statusCode = Number(response.statusCode || 0);
      if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
        response.resume();
        downloadBytes(new URL(response.headers.location, url).toString()).then(resolve, reject);
        return;
      }
      if (statusCode !== 200) {
        response.resume();
        reject(new Error(`download failed with HTTP ${statusCode}`));
        return;
      }
      const chunks: Uint8Array[] = [];
      response.on("data", (chunk: Uint8Array) => chunks.push(chunk));
      response.on("end", () => resolve(Buffer.concat(chunks)));
    });
    request.on("error", reject);
  });
}

function printReadiness(): void {
  const result = checkReleaseReadiness(buildReleaseManifest({ target: "windows-prototype" }), {
    exists: (filePath) => fs.existsSync(filePath),
  });
  console.log("release target: windows-prototype");
  console.log(`ready: ${result.ok ? "yes" : "no"}`);
  result.missingRequired.forEach((item) => console.log(`missing required: ${item.path} (${item.description})`));
  if (!result.ok) process.exitCode = 1;
}

if (process.argv.some((arg) => arg.endsWith("desktop/solver/nodeDownloadWindowsSolver.ts") || arg.endsWith("nodeDownloadWindowsSolver.ts"))) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
