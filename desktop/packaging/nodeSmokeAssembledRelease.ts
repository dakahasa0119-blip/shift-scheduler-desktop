import { buildPackageAssemblyPlan } from "./packageAssembly";
import { buildPackageSmokePlan } from "./packageSmoke";
import { buildPrepareReleasePlan } from "./releaseAutomation";
import { parseReleaseTarget, type ReleaseTarget } from "./releaseManifest";

declare const require: (name: string) => any;
declare const Buffer: {
  byteLength(input: string, encoding?: string): number;
};
declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  platform: string;
  exitCode?: number;
  kill(pid: number, signal?: string): void;
};

const childProcess = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

async function main(): Promise<void> {
  const targetArg = process.argv.find((arg) => arg.startsWith("--target="));
  const outputArg = process.argv.find((arg) => arg.startsWith("--out="));
  const portArg = process.argv.find((arg) => arg.startsWith("--port="));
  let target: ReleaseTarget | undefined;
  try {
    target = targetArg ? parseReleaseTarget(targetArg.replace("--target=", "")) : undefined;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  let releasePlan;
  try {
    releasePlan = buildPrepareReleasePlan({
      nodePlatform: process.platform,
      requestedTarget: target,
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  const assemblyPlan = buildPackageAssemblyPlan({
    target: releasePlan.target,
    outputRoot: outputArg ? outputArg.replace("--out=", "") : undefined,
  });
  const smokePlan = buildPackageSmokePlan({
    target: releasePlan.target,
    outputDirectory: assemblyPlan.outputDirectory,
    port: portArg ? Number(portArg.replace("--port=", "")) : undefined,
  });
  const launcherPath = path.resolve(smokePlan.launcherPath);
  const dataDirectory = path.resolve(smokePlan.dataDirectory);

  if (!fs.existsSync(launcherPath)) {
    console.error(`launcher missing: ${smokePlan.launcherPath}`);
    process.exitCode = 1;
    return;
  }

  const child = childProcess.spawn(launcherPath, [`--port=${smokePlan.port}`], {
    cwd: smokePlan.outputDirectory,
    detached: process.platform !== "win32",
    env: {
      ...process.env,
      SHIFT_DESKTOP_NO_OPEN: "1",
      SHIFT_DESKTOP_DATA_DIR: dataDirectory,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForOutput(child, smokePlan.expectedBaseUrl, 15000);
    const initial = await requestText(smokePlan.expectedBaseUrl, "GET");
    assertIncludes(initial.body, "勤務表作成", "initial title");
    assertIncludes(initial.body, 'actionBasePath = "/app"', "initial action path");

    const validate = await requestText(`${smokePlan.expectedBaseUrl}/app/validate`, "POST");
    assertEqual(validate.statusCode, 200, "validate status");
    assertIncludes(validate.body, "勤務表作成", "validate title");

    const solve = await requestText(`${smokePlan.expectedBaseUrl}/app/solve`, "POST");
    assertEqual(solve.statusCode, 200, "solve status");
    assertIncludes(solve.body, "勤務表作成", "solve title");

    const save = await requestText(`${smokePlan.expectedBaseUrl}/app/save`, "POST");
    assertEqual(save.statusCode, 200, "save status");
    assertIncludes(save.body, "保存しました", "save status text");

    const load = await requestText(`${smokePlan.expectedBaseUrl}/app/load`, "POST");
    assertEqual(load.statusCode, 200, "load status");
    assertIncludes(load.body, "読込しました", "load status text");

    const backup = await requestText(`${smokePlan.expectedBaseUrl}/app/backup`, "POST");
    assertEqual(backup.statusCode, 200, "backup status");
    assertIncludes(backup.body, "バックアップしました", "backup status text");

    if (!fs.existsSync(`${dataDirectory}/current-schedule.json`)) {
      throw new Error(`saved document missing: ${dataDirectory}/current-schedule.json`);
    }

    const exportedJson = await requestText(`${smokePlan.expectedBaseUrl}/app/export/json`, "GET");
    assertEqual(exportedJson.statusCode, 200, "json export status");
    assertIncludes(exportedJson.body, '"schemaVersion": "desktop-shift-schedule/v1"', "json export schema");

    const importedJson = await requestText(`${smokePlan.expectedBaseUrl}/app/import/json`, "POST", {
      documentText: exportedJson.body,
    });
    assertEqual(importedJson.statusCode, 200, "json import status");
    assertIncludes(importedJson.body, "詳細データを反映しました", "json import status text");

    const settings = await requestText(`${smokePlan.expectedBaseUrl}/app/import/settings`, "POST", {
      year: 2027,
      month: 2,
      requirements: {
        late: 2,
      },
    });
    assertEqual(settings.statusCode, 200, "settings import status");
    assertIncludes(settings.body, "設定を反映しました", "settings import status text");

    const scheduleTsv = await requestText(`${smokePlan.expectedBaseUrl}/app/export/schedule-tsv`, "GET");
    assertEqual(scheduleTsv.statusCode, 200, "schedule tsv export status");
    assertIncludes(scheduleTsv.body, "職種\t氏名", "schedule tsv header");

    const importedScheduleTsv = await requestText(`${smokePlan.expectedBaseUrl}/app/import/schedule-tsv`, "POST", {
      scheduleText: scheduleTsv.body,
    });
    assertEqual(importedScheduleTsv.statusCode, 200, "schedule tsv import status");
    assertIncludes(importedScheduleTsv.body, "勤務表を反映しました", "schedule tsv import status text");
    console.log(`smoke: passed ${smokePlan.expectedBaseUrl}`);
  } finally {
    stopLauncher(child);
    await waitForExit(child, 5000).catch(() => {
      forceStopLauncher(child);
    });
  }
}

interface HttpResponse {
  statusCode: number;
  body: string;
}

function requestText(url: string, method: "GET" | "POST", body?: unknown): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? "" : JSON.stringify(body);
    const request = http.request(
      url,
      {
        method,
        headers: payload
          ? {
              "content-type": "application/json",
              "content-length": String(Buffer.byteLength(payload, "utf8")),
            }
          : {},
      },
      (response: any) => {
      const chunks: string[] = [];
      response.on("data", (chunk: unknown) => chunks.push(String(chunk)));
      response.on("end", () =>
        resolve({
          statusCode: response.statusCode || 0,
          body: chunks.join(""),
        }),
      );
      },
    );
    request.on("error", reject);
    if (payload) request.write(payload);
    request.end();
  });
}

function waitForOutput(child: any, expected: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error(`launcher did not report ${expected}`)), timeoutMs);
    const onData = (chunk: unknown) => {
      output += String(chunk);
      if (output.includes(expected)) {
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", (code: number) => {
      clearTimeout(timer);
      reject(new Error(`launcher exited before smoke check: ${code}`));
    });
  });
}

function waitForExit(child: any, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (child.exitCode !== null) {
      resolve();
      return;
    }
    const timer = setTimeout(() => reject(new Error("launcher did not stop")), timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function stopLauncher(child: any): void {
  if (process.platform !== "win32" && typeof child.pid === "number") {
    try {
      process.kill(-child.pid, "SIGTERM");
      return;
    } catch {
      // Fall back to killing the direct child.
    }
  }
  child.kill("SIGTERM");
}

function forceStopLauncher(child: any): void {
  if (process.platform !== "win32" && typeof child.pid === "number") {
    try {
      process.kill(-child.pid, "SIGKILL");
      return;
    } catch {
      // Fall back to killing the direct child.
    }
  }
  child.kill("SIGKILL");
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertIncludes(text: string, expected: string, label: string): void {
  if (!text.includes(expected)) {
    throw new Error(`${label}: missing ${expected}`);
  }
}

if (process.argv.some((arg) => arg.endsWith("desktop/packaging/nodeSmokeAssembledRelease.ts") || arg.endsWith("nodeSmokeAssembledRelease.ts"))) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
