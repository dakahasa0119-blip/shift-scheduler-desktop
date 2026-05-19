import { DesktopApiClient } from "../app/desktopApiClient";
import { NodeHttpTransport } from "../app/nodeHttpTransport";
import { MockSolverRunner } from "../api/mockSolverRunner";
import { startLocalApiServer } from "../api/localServer";
import { sampleMonthlyScheduleDocument } from "../core/fixtures";
import type { MonthlyScheduleDocument } from "../core/domain";

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
    const client = new DesktopApiClient({
      baseUrl: server.url,
      transport: new NodeHttpTransport(),
    });

    const health = await client.health();
    assertEqual(health.ok, true, "health ok");
    assertEqual(health.version, "0.1.0-test", "health version");

    const validation = await client.validateSchedule({
      document: sampleMonthlyScheduleDocument,
    });
    assertEqual(validation.ok, true, "validation response ok");
    if (!validation.ok) return;
    assertEqual(validation.validation.ok, true, "validation ok");

    const solve = await client.solveSchedule({
      document: sampleMonthlyScheduleDocument,
      options: {
        timeLimitSeconds: 3,
        mode: "create",
      },
    });
    assertEqual(solve.ok, true, "solve response ok");
    if (!solve.ok) return;
    assertEqual(solver.calls.length, 1, "solver call count");
    assertEqual(solve.diagnostics.summary.allowedShortageCount, 1, "allowed shortage count");

    const exported = await client.exportExcel({
      document: solve.document,
      destinationPath: "/tmp/client-export.tsv",
    });
    assertEqual(exported.ok, true, "export response ok");
    if (!exported.ok) return;
    assertEqual(exported.filePath, "/tmp/client-export.tsv", "export file path");

    const pdf = await client.exportPdf({
      document: solve.document,
      destinationPath: "/tmp/client-export.print.html",
    });
    assertEqual(pdf.ok, true, "pdf export response ok");
    if (!pdf.ok) return;
    assertEqual(pdf.filePath, "/tmp/client-export.print.html", "pdf export file path");
    assertEqual(pdf.format, "print-html", "pdf export format");

    const saved = await client.saveDocument({
      document: solve.document,
    });
    assertEqual(saved.ok, true, "save response ok");

    const loaded = await client.loadDocument();
    assertEqual(loaded.ok, true, "load response ok");
    if (!loaded.ok) return;
    assertEqual(loaded.document.month, sampleMonthlyScheduleDocument.month, "loaded month");

    const backup = await client.backupDocument({
      document: loaded.document,
    });
    assertEqual(backup.ok, true, "backup response ok");
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

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

main().catch((error) => {
  console.error(error);
  throw error;
});
