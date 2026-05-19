import { startAppShellServer } from "../app/appShellServer";
import type { DesktopLocalApi, DesktopLocalApiOptions } from "../api/bootstrap";
import type { DesktopApiClientTransport, DesktopApiRequestOptions, DesktopApiResponse } from "../app/desktopApiClient";
import type { BundledSolverRuntimeConfig } from "../solver/bundledSolverTypes";
import { sampleMonthlyScheduleDocument, sampleSolverOutputWithAdvisory } from "../core/fixtures";
import { applySolverOutputToDocument } from "../core/solverOutput";

declare const require: (name: string) => any;
declare const Buffer: {
  byteLength(input: string, encoding?: string): number;
};

const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const os = require("node:os");

async function main(): Promise<void> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "shift-app-shell-"));
  const server = await startAppShellServer({
    runtimeOptions: {
      appVersion: "0.1.0-test",
      apiStarter: new FakeStarter(),
      transportFactory: () => new FakeTransport(directory),
    },
    document: sampleMonthlyScheduleDocument,
  });

  try {
    assertTrue(server.url.startsWith("http://127.0.0.1:"), "shell url");
    const initial = await get(server.url);
    assertEqual(initial.statusCode, 200, "initial status code");
    assertIncludes(initial.body, "作成できます", "initial status");
    assertIncludes(initial.body, 'actionBasePath = "/app"', "app action base path");

    const validate = await post(`${server.url}/app/validate`);
    assertEqual(validate.statusCode, 200, "validate status code");
    assertIncludes(validate.body, "作成できます", "validate response");

    const solve = await post(`${server.url}/app/solve`);
    assertEqual(solve.statusCode, 200, "solve status code");
    assertIncludes(solve.body, "作成できました（確認事項あり）", "solve response");

    const recovery = await postJson(`${server.url}/app/recover`, {
      urgentLeaveText: "氏名\t日付\t理由\t備考\n江藤\t2026-06-05\t急休\t発熱\n",
      fixedThroughDate: "2026-06-04",
    });
    assertEqual(recovery.statusCode, 200, "recovery status code");
    assertIncludes(recovery.body, "急休リカバリーを反映しました", "recovery response");

    const save = await post(`${server.url}/app/save`);
    assertEqual(save.statusCode, 200, "save status code");
    assertIncludes(save.body, "保存しました", "save response");

    const load = await post(`${server.url}/app/load`);
    assertEqual(load.statusCode, 200, "load status code");
    assertIncludes(load.body, "読込しました", "load response");

    const backup = await post(`${server.url}/app/backup`);
    assertEqual(backup.statusCode, 200, "backup status code");
    assertIncludes(backup.body, "バックアップしました", "backup response");

    const imported = await postJson(`${server.url}/app/import/json`, {
      documentText: JSON.stringify({ ...sampleMonthlyScheduleDocument, month: 7 }),
    });
    assertEqual(imported.statusCode, 200, "json import status code");
    assertIncludes(imported.body, "JSONを反映しました", "json import response");

    const settings = await postJson(`${server.url}/app/import/settings`, {
      year: 2027,
      month: 2,
      requirements: {
        late: 2,
      },
    });
    assertEqual(settings.statusCode, 200, "settings import status code");
    assertIncludes(settings.body, "設定を反映しました", "settings import response");

    const exportedTsv = await get(`${server.url}/app/export/schedule-tsv`);
    assertEqual(exportedTsv.statusCode, 200, "schedule tsv export status code");
    assertIncludes(exportedTsv.body, "職種\t氏名", "schedule tsv export");

    const importedTsv = await postJson(`${server.url}/app/import/schedule-tsv`, {
      scheduleText: "介護リーダー\t江藤\t日\t日\t公\n介護\t有山\t早\t早\t遅\n",
    });
    assertEqual(importedTsv.statusCode, 200, "schedule tsv import status code");
    assertIncludes(importedTsv.body, "勤務表TSVを反映しました", "schedule tsv import response");

    const postEdit = await post(`${server.url}/app/post-edit-recheck`);
    assertEqual(postEdit.statusCode, 200, "post edit status code");
    assertIncludes(postEdit.body, "手修正後の再判定", "post edit response");

    const exportedStaff = await get(`${server.url}/app/export/staff-tsv`);
    assertEqual(exportedStaff.statusCode, 200, "staff tsv export status code");
    assertIncludes(exportedStaff.body, "氏名\t職種", "staff tsv export");

    const importedStaff = await postJson(`${server.url}/app/import/staff-tsv`, {
      staffText: exportedStaff.body.replace("介護リーダー", "主任"),
    });
    assertEqual(importedStaff.statusCode, 200, "staff tsv import status code");
    assertIncludes(importedStaff.body, "職員一覧を反映しました", "staff tsv import response");

    const exportedRequests = await get(`${server.url}/app/export/requests-tsv`);
    assertEqual(exportedRequests.statusCode, 200, "requests tsv export status code");
    assertIncludes(exportedRequests.body, "氏名\t区分", "requests tsv export");

    const importedRequests = await postJson(`${server.url}/app/import/requests-tsv`, {
      requestsText: "氏名\t区分\t開始日\t終了日\t備考\n江藤\t希望夜勤\t2027-02-10\t2027-02-10\t確認\n",
    });
    assertEqual(importedRequests.statusCode, 200, "requests tsv import status code");
    assertIncludes(importedRequests.body, "希望休・希望勤務を反映しました", "requests tsv import response");

    const exportedJson = await get(`${server.url}/app/export/json`);
    assertEqual(exportedJson.statusCode, 200, "json export status code");
    assertIncludes(exportedJson.body, '"month": 2', "json export month");

    const aiDebug = await get(`${server.url}/app/export/ai-debug-json`);
    assertEqual(aiDebug.statusCode, 200, "ai debug status code");
    assertIncludes(aiDebug.body, '"schemaVersion": "desktop-shift-scheduler-ai-debug/v1"', "ai debug schema");
    assertIncludes(aiDebug.body, '"source": "desktop-linux"', "ai debug source");

    const capacityRun = await postJson(`${server.url}/app/run-capacity-simulation`, {});
    assertEqual(capacityRun.statusCode, 200, "capacity run status code");
    assertIncludes(capacityRun.body, "体制シミュレーションを再計算しました", "capacity run response");

    const capacityJson = await get(`${server.url}/app/export/capacity-simulation-json`);
    assertEqual(capacityJson.statusCode, 200, "capacity export status code");
    assertIncludes(capacityJson.body, '"schemaVersion": "capacity-simulation/v1"', "capacity export schema");

    const capacityImport = await postJson(`${server.url}/app/import/capacity-simulation-json`, {
      capacitySimulationText: capacityJson.body,
    });
    assertEqual(capacityImport.statusCode, 200, "capacity import status code");
    assertIncludes(capacityImport.body, "体制シミュレーションJSONを取り込みました", "capacity import response");

    const excel = await get(`${server.url}/app/export/excel`);
    assertEqual(excel.statusCode, 200, "excel status code");
    assertEqual(excel.body.charCodeAt(0), 0x50, "excel zip byte 1");
    assertEqual(excel.body.charCodeAt(1), 0x4b, "excel zip byte 2");

    const pdf = await get(`${server.url}/app/export/pdf`);
    assertEqual(pdf.statusCode, 200, "pdf status code");
    assertIncludes(pdf.body, "%PDF", "pdf body");
  } finally {
    await server.close();
  }

  const autoloadServer = await startAppShellServer({
    runtimeOptions: {
      appVersion: "0.1.0-test",
      apiStarter: new FakeStarter(),
      transportFactory: () => new FakeTransport(directory, {
        loadedDocument: { ...sampleMonthlyScheduleDocument, month: 8 },
      }),
    },
  });
  try {
    const initial = await get(autoloadServer.url);
    assertEqual(initial.statusCode, 200, "autoload status code");
    assertIncludes(initial.body, "2026年8月 勤務表", "autoload document");
  } finally {
    await autoloadServer.close();
  }

  const blankServer = await startAppShellServer({
    runtimeOptions: {
      appVersion: "0.1.0-test",
      apiStarter: new FakeStarter(),
      transportFactory: () => new FakeTransport(directory, {
        loadMissing: true,
      }),
    },
  });
  try {
    const initial = await get(blankServer.url);
    assertEqual(initial.statusCode, 200, "blank status code");
    assertIncludes(initial.body, "勤務表作成", "blank title");
    assertNotIncludes(initial.body, "江藤", "blank does not show sample staff");
    assertNotIncludes(initial.body, "有山", "blank does not show sample staff");
  } finally {
    await blankServer.close();
  }

  const quitServer = await startAppShellServer({
    runtimeOptions: {
      appVersion: "0.1.0-test",
      apiStarter: new FakeStarter(),
      transportFactory: () => new FakeTransport(directory),
    },
    document: sampleMonthlyScheduleDocument,
  });
  const quit = await post(`${quitServer.url}/app/quit`);
  assertEqual(quit.statusCode, 200, "quit status code");
  assertIncludes(quit.body, "勤務表作成を終了しました", "quit page");
}

class FakeStarter {
  async start(_options: DesktopLocalApiOptions): Promise<DesktopLocalApi> {
    return {
      server: {
        host: "127.0.0.1",
        port: 41000,
        url: "http://127.0.0.1:41000",
        close: async () => {},
      },
      solverConfig: {} as BundledSolverRuntimeConfig,
      close: async () => {},
    };
  }
}

class FakeTransport implements DesktopApiClientTransport {
  constructor(
    private readonly directory: string,
    private readonly options: { loadedDocument?: typeof sampleMonthlyScheduleDocument; loadMissing?: boolean } = {},
  ) {}

  async request(options: DesktopApiRequestOptions): Promise<DesktopApiResponse> {
    if (options.method === "GET" && options.path.endsWith("/health")) {
      return {
        statusCode: 200,
        body: {
          ok: true,
          status: "ready",
          app: "shift-desktop-local-api",
          version: "0.1.0-test",
        },
      };
    }
    if (options.method === "POST" && options.path.endsWith("/schedule/validate")) {
      return {
        statusCode: 200,
        body: {
          ok: true,
          validation: {
            ok: true,
            issues: [],
          },
        },
      };
    }
    if (options.method === "POST" && options.path.endsWith("/schedule/solve")) {
      const document = applySolverOutputToDocument(sampleMonthlyScheduleDocument, sampleSolverOutputWithAdvisory);
      return {
        statusCode: 200,
        body: {
          ok: true,
          document,
          diagnostics: document.diagnostics,
          messages: document.diagnostics?.messages || [],
        },
      };
    }
    if (options.method === "POST" && options.path.endsWith("/schedule/recover")) {
      const document = applySolverOutputToDocument(sampleMonthlyScheduleDocument, sampleSolverOutputWithAdvisory);
      return {
        statusCode: 200,
        body: {
          ok: true,
          document,
          diagnostics: document.diagnostics,
          messages: document.diagnostics?.messages || [],
          diffs: [
            {
              date: "6/5",
              staffId: "staff_eto",
              name: "江藤",
              before: "早",
              after: "休",
              labels: ["急休"],
            },
          ],
        },
      };
    }
    if (options.method === "POST" && options.path.endsWith("/export/excel")) {
      const filePath = path.join(this.directory, "schedule.xlsx");
      await fs.writeFile(filePath, new Uint8Array([0x50, 0x4b, 0x03, 0x04]));
      return {
        statusCode: 200,
        body: {
          ok: true,
          filePath,
        },
      };
    }
    if (options.method === "POST" && options.path.endsWith("/export/pdf")) {
      const filePath = path.join(this.directory, "schedule.pdf");
      await fs.writeFile(filePath, "%PDF fake");
      return {
        statusCode: 200,
        body: {
          ok: true,
          filePath,
          format: "pdf",
        },
      };
    }
    if (options.method === "POST" && options.path.endsWith("/document/save")) {
      return {
        statusCode: 200,
        body: {
          ok: true,
          filePath: path.join(this.directory, "current-schedule.json"),
        },
      };
    }
    if (options.method === "GET" && options.path.endsWith("/document/load")) {
      if (this.options.loadMissing) {
        return {
          statusCode: 404,
          body: {
            ok: false,
            userMessage: "保存データがありません",
          },
        };
      }
      const document = this.options.loadedDocument || sampleMonthlyScheduleDocument;
      return {
        statusCode: 200,
        body: {
          ok: true,
          document,
          filePath: path.join(this.directory, "current-schedule.json"),
        },
      };
    }
    if (options.method === "POST" && options.path.endsWith("/document/backup")) {
      return {
        statusCode: 200,
        body: {
          ok: true,
          filePath: path.join(this.directory, "backup.json"),
        },
      };
    }
    return {
      statusCode: 404,
      body: {
        ok: false,
        userMessage: "not found",
      },
    };
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

function post(url: string): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const request = http.request(url, { method: "POST" }, (response: any) => {
      const chunks: string[] = [];
      response.on("data", (chunk: unknown) => chunks.push(String(chunk)));
      response.on("end", () =>
        resolve({
          statusCode: response.statusCode || 0,
          body: chunks.join(""),
        }),
      );
    });
    request.on("error", reject);
    request.end();
  });
}

function postJson(url: string, body: unknown): Promise<HttpResponse> {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const request = http.request(
      url,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": String(Buffer.byteLength(payload, "utf8")),
        },
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
    request.write(payload);
    request.end();
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

function assertNotIncludes(text: string, expected: string, label: string): void {
  if (text.includes(expected)) {
    throw new Error(`${label}: unexpectedly included ${expected}`);
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
