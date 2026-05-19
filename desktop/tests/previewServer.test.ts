import { startPreviewServer } from "../app/previewServer";

declare const require: (name: string) => any;

const http = require("node:http");

async function main(): Promise<void> {
  const server = await startPreviewServer();
  try {
    assertTrue(server.url.startsWith("http://127.0.0.1:"), "preview url");
    const response = await get(server.url);
    assertEqual(response.statusCode, 200, "preview status");
    assertIncludes(response.body, "<h1>勤務表作成</h1>", "preview title");
    assertIncludes(response.body, "作成できます", "initial status text");
    assertIncludes(response.body, "勤務表", "preview schedule");
    assertIncludes(response.body, 'data-action="validate"', "validate action");
    assertIncludes(response.body, 'data-action="solve"', "solve action");

    const validation = await post(`${server.url}/preview/validate`);
    assertEqual(validation.statusCode, 200, "validate status");
    assertIncludes(validation.body, "作成できます", "validate response");

    const solve = await post(`${server.url}/preview/solve`);
    assertEqual(solve.statusCode, 200, "solve status");
    assertIncludes(solve.body, "作成できました（確認事項あり）", "solve response");
    assertIncludes(solve.body, "6/3 遅 1名不足", "solve diagnostics");

    const exportResponse = await get(`${server.url}/preview/export/excel`);
    assertEqual(exportResponse.statusCode, 200, "export status");
    assertEqual(exportResponse.body.charCodeAt(0), 0x50, "export zip byte 1");
    assertEqual(exportResponse.body.charCodeAt(1), 0x4b, "export zip byte 2");

    const pdfPreview = await get(`${server.url}/preview/export/pdf`);
    assertEqual(pdfPreview.statusCode, 200, "pdf preview status");
    assertTrue(
      pdfPreview.body.startsWith("%PDF") || pdfPreview.body.includes("size: A4 landscape"),
      "pdf preview content",
    );

    const missing = await get(`${server.url}/missing`);
    assertEqual(missing.statusCode, 404, "missing status");
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
