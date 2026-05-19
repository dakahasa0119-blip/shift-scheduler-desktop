import { MockSolverRunner } from "../api/mockSolverRunner";
import { startLocalApiServer } from "../api/localServer";
import { sampleMonthlyScheduleDocument } from "../core/fixtures";
import type { MonthlyScheduleDocument } from "../core/domain";

declare const require: (name: string) => any;
declare const Buffer: {
  byteLength(input: string, encoding?: string): number;
};

const http = require("node:http");

async function main(): Promise<void> {
  const solver = new MockSolverRunner();
  const server = await startLocalApiServer({
    deps: {
      appVersion: "0.1.0-test",
      now: () => new Date(2026, 4, 19, 20, 0, 0),
      solver,
      exports: buildMemoryExportDeps(),
      storage: buildMemoryStorage(),
    },
  });

  try {
    assertTrue(server.url.startsWith("http://127.0.0.1:"), "server loopback url");

    const health = await requestJson(server, "GET", "/health");
    assertEqual(health.statusCode, 200, "health status code");
    assertEqual(health.body.ok, true, "health ok");
    assertEqual(health.body.app, "shift-desktop-local-api", "health app");

    const validation = await requestJson(server, "POST", "/schedule/validate", {
      document: sampleMonthlyScheduleDocument,
    });
    assertEqual(validation.statusCode, 200, "validate status code");
    assertEqual(validation.body.ok, true, "validate response ok");
    assertEqual(validation.body.validation.ok, true, "validate document ok");

    const solve = await requestJson(server, "POST", "/schedule/solve", {
      document: sampleMonthlyScheduleDocument,
      options: {
        timeLimitSeconds: 3,
        mode: "create",
      },
    });
    assertEqual(solve.statusCode, 200, "solve status code");
    assertEqual(solve.body.ok, true, "solve response ok");
    assertEqual(solver.calls.length, 1, "solver call count");
    assertEqual(solver.calls[0].options.timeLimitSeconds, 10, "normalized time limit");
    assertTrue(
      solve.body.messages.some((line: string) => line.includes("結果: 作成できました")),
      "solve user message",
    );

    const exported = await requestJson(server, "POST", "/export/excel", {
      document: solve.body.document,
      destinationPath: "/tmp/local-api-export.tsv",
    });
    assertEqual(exported.statusCode, 200, "export status code");
    assertEqual(exported.body.ok, true, "export response ok");
    assertEqual(exported.body.filePath, "/tmp/local-api-export.tsv", "export file path");

    const pdf = await requestJson(server, "POST", "/export/pdf", {
      document: solve.body.document,
      destinationPath: "/tmp/local-api-export.print.html",
    });
    assertEqual(pdf.statusCode, 200, "pdf export status code");
    assertEqual(pdf.body.ok, true, "pdf export response ok");
    assertEqual(pdf.body.filePath, "/tmp/local-api-export.print.html", "pdf export file path");

    const saved = await requestJson(server, "POST", "/document/save", {
      document: solve.body.document,
    });
    assertEqual(saved.statusCode, 200, "save status code");
    assertEqual(saved.body.ok, true, "save response ok");

    const loaded = await requestJson(server, "GET", "/document/load");
    assertEqual(loaded.statusCode, 200, "load status code");
    assertEqual(loaded.body.ok, true, "load response ok");
    assertEqual(loaded.body.document.month, sampleMonthlyScheduleDocument.month, "loaded document");

    const backup = await requestJson(server, "POST", "/document/backup", {
      document: solve.body.document,
    });
    assertEqual(backup.statusCode, 200, "backup status code");
    assertEqual(backup.body.ok, true, "backup response ok");

    const missing = await requestJson(server, "GET", "/missing");
    assertEqual(missing.statusCode, 404, "missing route status code");
    assertEqual(missing.body.ok, false, "missing route error");
  } finally {
    await server.close();
  }
}

function buildMemoryStorage() {
  let document: MonthlyScheduleDocument | null = null;
  return {
    async save(next: MonthlyScheduleDocument): Promise<{ filePath: string }> {
      document = next;
      return { filePath: "/tmp/current-schedule.json" };
    },
    async load(): Promise<{ filePath: string; document: MonthlyScheduleDocument }> {
      if (!document) throw new Error("missing document");
      return { filePath: "/tmp/current-schedule.json", document };
    },
    async backup(next: MonthlyScheduleDocument): Promise<{ filePath: string }> {
      document = next;
      return { filePath: "/tmp/backup.json" };
    },
  };
}

function buildMemoryExportDeps() {
  const files = new Map<string, string>();
  return {
    writer: {
      async writeText(path: string, content: string): Promise<void> {
        files.set(path, content);
      },
      async writeBinary(path: string, content: Uint8Array): Promise<void> {
        files.set(path, String(content[0]));
      },
    },
    paths: {
      defaultExcelPath(_document: MonthlyScheduleDocument): string {
        return "/tmp/default-export.tsv";
      },
      defaultPdfPath(_document: MonthlyScheduleDocument): string {
        return "/tmp/default-export.print.html";
      },
    },
  };
}

interface TestResponse {
  statusCode: number;
  body: any;
}

function requestJson(server: { host: string; port: number }, method: string, path: string, body?: unknown): Promise<TestResponse> {
  const payload = body === undefined ? "" : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: server.host,
        port: server.port,
        path,
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
