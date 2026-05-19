import { startDesktopLocalApi } from "../api/bootstrap";
import { sampleMonthlyScheduleDocument } from "../core/fixtures";

declare const require: (name: string) => any;
declare const Buffer: {
  byteLength(input: string, encoding?: string): number;
};

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

async function main(): Promise<void> {
  const executablePath = path.resolve("desktop/packaging/resources/solver/linux-x64/shift-solver");
  if (!fs.existsSync(executablePath)) {
    console.log("skip: linux bundled solver artifact does not exist");
    return;
  }

  const api = await startDesktopLocalApi({
    appVersion: "0.1.0-test",
    now: () => new Date(2026, 4, 19, 20, 0, 0),
    platform: "linux-x64",
    defaultTimeLimitSeconds: 10,
  });

  try {
    assertEqual(api.solverConfig.executablePath, executablePath, "bootstrap solver executable path");
    assertTrue(api.server.url.startsWith("http://127.0.0.1:"), "bootstrap loopback url");

    const health = await requestJson(api.server, "GET", "/health");
    assertEqual(health.statusCode, 200, "health status code");
    assertEqual(health.body.ok, true, "health ok");

    const solve = await requestJson(api.server, "POST", "/schedule/solve", {
      document: sampleMonthlyScheduleDocument,
      options: {
        timeLimitSeconds: 10,
        mode: "create",
      },
    });
    assertEqual(solve.statusCode, 200, "real solver solve status code");
    assertEqual(solve.body.ok, true, "real solver solve ok");
    assertTrue(Array.isArray(solve.body.messages), "real solver messages");
  } finally {
    await api.close();
  }
}

interface TestResponse {
  statusCode: number;
  body: any;
}

function requestJson(server: { host: string; port: number }, method: string, requestPath: string, body?: unknown): Promise<TestResponse> {
  const payload = body === undefined ? "" : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: server.host,
        port: server.port,
        path: requestPath,
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
        response.on("end", () => {
          try {
            resolve({
              statusCode: response.statusCode || 0,
              body: JSON.parse(chunks.join("") || "{}"),
            });
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    request.on("error", reject);
    if (payload) request.write(payload);
    request.end();
  });
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

main().catch((error) => {
  console.error(error);
  throw error;
});
