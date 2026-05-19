import { AppController } from "../app/appController";
import type {
  ExportExcelRequest,
  ExportExcelResponse,
  ExportPdfRequest,
  ExportPdfResponse,
  SolveScheduleRequest,
  SolveScheduleResponse,
  ValidateScheduleRequest,
  ValidateScheduleResponse,
  SaveDocumentRequest,
  SaveDocumentResponse,
  LoadDocumentResponse,
  BackupDocumentRequest,
  BackupDocumentResponse,
} from "../api/contracts";
import { sampleMonthlyScheduleDocument, sampleSolverOutputWithAdvisory } from "../core/fixtures";
import { applySolverOutputToDocument } from "../core/solverOutput";

async function main(): Promise<void> {
  const api = new FakeApiClient();
  const controller = new AppController(sampleMonthlyScheduleDocument, api);

  assertEqual(controller.getState().busy, false, "initial busy");
  assertEqual(controller.getState().viewModel.status.label, "作成できます", "initial status");

  const validated = await controller.validate();
  assertEqual(validated.busy, false, "validated busy");
  assertEqual(api.validateCalls.length, 1, "validate call count");
  assertEqual(validated.viewModel.status.label, "作成できます", "validated status");

  const solved = await controller.solve();
  assertEqual(solved.busy, false, "solved busy");
  assertEqual(api.solveCalls.length, 1, "solve call count");
  assertEqual(api.solveCalls[0].options?.timeLimitSeconds, 120, "solve time limit");
  assertEqual(solved.viewModel.status.label, "作成できました（確認事項あり）", "solved status");
  assertEqual(solved.viewModel.diagnostics?.sections[0].title, "確認事項", "diagnostics shown");
  assertEqual(solved.document.diagnostics?.summary.allowedShortageCount, 1, "document updated");

  const excel = await controller.exportExcel();
  assertEqual(excel.ok, true, "excel export ok");
  if (!excel.ok) return;
  assertEqual(excel.filePath, "/tmp/controller-export.xlsx", "excel export path");

  const pdf = await controller.exportPdf();
  assertEqual(pdf.ok, true, "pdf export ok");
  if (!pdf.ok) return;
  assertEqual(pdf.filePath, "/tmp/controller-export.pdf", "pdf export path");

  const saved = await controller.save();
  assertEqual(saved.viewModel.status.label, "保存しました", "save status");
  assertEqual(api.saveCalls.length, 1, "save call count");

  const loaded = await controller.load();
  assertEqual(loaded.viewModel.status.label, "読込しました", "load status");
  assertEqual(api.loadCalls, 1, "load call count");

  const backedUp = await controller.backup();
  assertEqual(backedUp.viewModel.status.label, "バックアップしました", "backup status");
  assertEqual(api.backupCalls.length, 1, "backup call count");

  const settings = controller.updateSettings({
    year: 2027,
    month: 2,
    requirements: {
      late: 2,
    },
  });
  assertEqual(settings.viewModel.status.label, "設定を反映しました", "settings status");
  assertEqual(settings.document.year, 2027, "settings year");
  assertEqual(settings.document.month, 2, "settings month");
  assertEqual(settings.document.requirements.late, 2, "settings late");

  const tsv = controller.importScheduleTsv("介護リーダー\t江藤\t日\t日\t公\n介護\t有山\t早\t早\t遅\n");
  assertEqual(tsv.viewModel.status.label, "勤務表TSVを反映しました", "tsv status");
  assertEqual(tsv.document.schedule[0].shifts[0], "日", "tsv shift");

  const updated = controller.updateDocument({
    ...sampleMonthlyScheduleDocument,
    month: 7,
    schedule: [],
    diagnostics: null,
  });
  assertEqual(updated.viewModel.schedule.days.length, 31, "updated month days");
  assertEqual(updated.viewModel.diagnostics, null, "updated diagnostics reset");
}

class FakeApiClient {
  validateCalls: ValidateScheduleRequest[] = [];
  solveCalls: SolveScheduleRequest[] = [];
  excelCalls: ExportExcelRequest[] = [];
  pdfCalls: ExportPdfRequest[] = [];
  saveCalls: SaveDocumentRequest[] = [];
  loadCalls = 0;
  backupCalls: BackupDocumentRequest[] = [];

  async validateSchedule(request: ValidateScheduleRequest): Promise<ValidateScheduleResponse> {
    this.validateCalls.push(request);
    return {
      ok: true,
      validation: {
        ok: true,
        issues: [],
      },
    };
  }

  async solveSchedule(request: SolveScheduleRequest): Promise<SolveScheduleResponse> {
    this.solveCalls.push(request);
    const document = applySolverOutputToDocument(sampleMonthlyScheduleDocument, sampleSolverOutputWithAdvisory);
    return {
      ok: true,
      document,
      diagnostics: document.diagnostics!,
      messages: document.diagnostics!.messages,
    };
  }

  async exportExcel(request: ExportExcelRequest): Promise<ExportExcelResponse> {
    this.excelCalls.push(request);
    return {
      ok: true,
      filePath: "/tmp/controller-export.xlsx",
    };
  }

  async exportPdf(request: ExportPdfRequest): Promise<ExportPdfResponse> {
    this.pdfCalls.push(request);
    return {
      ok: true,
      filePath: "/tmp/controller-export.pdf",
      format: "pdf",
    };
  }

  async saveDocument(request: SaveDocumentRequest): Promise<SaveDocumentResponse> {
    this.saveCalls.push(request);
    return {
      ok: true,
      filePath: "/tmp/current-schedule.json",
    };
  }

  async loadDocument(): Promise<LoadDocumentResponse> {
    this.loadCalls += 1;
    return {
      ok: true,
      document: sampleMonthlyScheduleDocument,
      filePath: "/tmp/current-schedule.json",
    };
  }

  async backupDocument(request: BackupDocumentRequest): Promise<BackupDocumentResponse> {
    this.backupCalls.push(request);
    return {
      ok: true,
      filePath: "/tmp/backup.json",
    };
  }
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
