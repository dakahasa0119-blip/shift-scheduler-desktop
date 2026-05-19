import { startAppShellServer } from "../app/appShellServer";

declare const require: (name: string) => any;

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

async function main(): Promise<void> {
  const executablePath = path.resolve("desktop/packaging/resources/solver/linux-x64/shift-solver");
  if (!fs.existsSync(executablePath)) {
    console.log("skip: linux bundled solver artifact does not exist");
    return;
  }

  const server = await startAppShellServer({
    runtimeOptions: {
      appVersion: "0.1.0-shell-smoke",
      platform: "linux-x64",
      defaultTimeLimitSeconds: 10,
    },
  });

  try {
    assertTrue(server.url.startsWith("http://127.0.0.1:"), "shell url");
    const response = await get(server.url);
    assertEqual(response.statusCode, 200, "shell status code");
    assertIncludes(response.body, "勤務表作成", "title");
    assertIncludes(response.body, "作成できます", "initial status");
  } finally {
    await server.close();
  }
}

interface HttpResponse {
  statusCode: number;
  body: string;
}

function get(url: string): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    http.get(url, (response: any) => {
      const chunks: string[] = [];
      response.on("data", (chunk: unknown) => chunks.push(String(chunk)));
      response.on("end", () =>
        resolve({
          statusCode: response.statusCode || 0,
          body: chunks.join(""),
        }),
      );
    }).on("error", reject);
  });
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

function assertTrue(value: boolean, label: string): void {
  if (!value) {
    throw new Error(`${label}: expected true`);
  }
}

main().catch((error) => {
  console.error(error);
  throw error;
});
