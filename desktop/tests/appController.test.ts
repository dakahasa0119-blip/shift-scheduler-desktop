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
  RecoverScheduleRequest,
  RecoverScheduleResponse,
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

  const recovered = await controller.recover("氏名\t日付\t理由\t備考\n江藤\t2026-06-05\t急休\t発熱\n", "2026-06-04");
  assertEqual(recovered.busy, false, "recovered busy");
  assertEqual(api.recoverCalls.length, 1, "recover call count");
  assertEqual(api.recoverCalls[0].urgentLeaves[0].staffId, "staff_eto", "recover staff id");
  assertEqual(api.recoverCalls[0].urgentLeaves[0].date, "2026-06-05", "recover date");
  assertEqual(api.recoverCalls[0].options?.fixedThroughDate, "2026-06-04", "recover fixed date");
  assertEqual(recovered.viewModel.status.label, "急休リカバリーを反映しました（変更 1件）", "recover status");

  const actual = controller.createActualSchedule();
  assertEqual(actual.viewModel.status.label, "勤務実績を作成 / 更新しました", "actual status");
  assertEqual(actual.document.actualSchedule?.length, actual.document.schedule.length, "actual row count");
  assertEqual(actual.document.changeHistory?.at(-1)?.category, "勤務実績作成", "actual history");

  const plannedLeave = controller.addLeaveRequest({
    staffName: "江藤",
    type: "有給",
    startDate: "2026-06-08",
    endDate: "2026-06-08",
    notes: "私用",
  });
  assertEqual(plannedLeave.viewModel.status.label, "休暇・希望勤務を登録しました", "leave status");
  assertEqual(plannedLeave.document.requests.at(-1)?.type, "有給", "leave request type");
  assertEqual(plannedLeave.document.changeHistory?.at(-1)?.afterValue, "有", "leave history shift");

  const urgentLeave = controller.addLeaveRequest({
    staffName: "江藤",
    type: "当日急遽休",
    startDate: "2026-06-05",
    notes: "発熱",
  });
  assertEqual(urgentLeave.document.urgentLeaveHistory?.length, 1, "urgent leave history");
  assertEqual(urgentLeave.document.actualSchedule?.[0].shifts[4], "公", "urgent leave actual shift");

  const urgentCanceled = controller.cancelUrgentLeave({ index: 0 });
  assertEqual(urgentCanceled.viewModel.status.label, "急遽休を取り消しました", "urgent cancel status");
  assertEqual(urgentCanceled.document.urgentLeaveHistory?.[0].canceled, true, "urgent canceled flag");
  assertEqual(
    urgentCanceled.document.actualSchedule?.[0].shifts[4],
    urgentLeave.document.urgentLeaveHistory?.[0].originalShift,
    "urgent cancel restored shift",
  );

  const plannedCanceled = controller.cancelPlannedLeave({ index: urgentCanceled.document.requests.length - 2 });
  assertEqual(plannedCanceled.viewModel.status.label, "事前休暇を取り消しました", "planned cancel status");
  assertEqual(plannedCanceled.document.changeHistory?.at(-1)?.category, "事前休暇取消", "planned cancel history");

  const capacity = controller.runCapacitySimulation();
  assertEqual(capacity.viewModel.status.label, "体制シミュレーションを再計算しました", "capacity status");
  assertEqual(capacity.document.capacitySimulation?.schemaVersion, "capacity-simulation/v1", "capacity schema");
  assertEqual(capacity.document.capacitySimulation?.planSummaries.length, 4, "capacity summary count");

  const refreshedCapacity = controller.refreshCapacitySimulation();
  assertEqual(refreshedCapacity.viewModel.status.label, "体制シミュレーション表示を更新しました", "capacity refresh");

  const importedCapacity = controller.importCapacitySimulationJson(JSON.stringify(capacity.document.capacitySimulation));
  assertEqual(importedCapacity.viewModel.status.label, "体制シミュレーションJSONを取り込みました", "capacity import");

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
  assertEqual(tsv.viewModel.status.label, "勤務表TSVを反映しました（自動再判定済み）", "tsv status");
  assertEqual(tsv.document.schedule[0].shifts[0], "日", "tsv shift");
  assertEqual(Boolean(tsv.document.diagnostics), true, "tsv auto diagnostics");

  const postEdit = controller.runPostEditScheduleRecheck();
  assertEqual(postEdit.viewModel.status.label.startsWith("手修正後の再判定:"), true, "post edit status");

  const staff = controller.importStaffTsv(tsv.viewModel.staffTsv.replace("介護リーダー", "主任"));
  assertEqual(staff.viewModel.status.label, "職員一覧を反映しました（自動再判定済み）", "staff tsv status");
  assertEqual(staff.document.staff[0].role, "主任", "staff role");

  const requests = controller.importRequestsTsv("氏名\t区分\t開始日\t終了日\t備考\n江藤\t希望夜勤\t2027-02-10\t2027-02-10\t確認\n");
  assertEqual(requests.viewModel.status.label, "希望休・希望勤務を反映しました（自動再判定済み）", "requests tsv status");
  assertEqual(requests.document.requests[0].type, "希望夜勤", "request type");

  const gasImported = controller.importJson(
    JSON.stringify({
      ok: true,
      action: "exportSolverInputBundle",
      result: {
      schemaVersion: "gas-shift-solver-input/v1",
      generatedAt: "2026-05-20 09:00:00",
      source: "gas",
      targetYear: 2026,
      targetMonth: 6,
      daysInMonth: 30,
      requiredShiftStaffing: { "早": 1, "日": 0, "遅": 1, "夜": 1 },
      requiredCoreShiftTypes: ["早", "遅", "夜"],
      optionalShiftTypes: ["日"],
      femaleRequiredWeekdays: [],
      allowedShortagePolicy: { allowedShortageShifts: ["遅"] },
      staffConditions: [
        {
          staffType: "介護",
          name: "北富",
          condition: "月2回",
          allowedShift: "早・日・遅・夜",
          monday: true,
          tuesday: true,
          wednesday: true,
          thursday: true,
          friday: true,
          saturday: true,
          sunday: true,
          fixedOff: "",
          gender: "女性",
        },
      ],
      leaveEntries: [{ name: "北富", type: "希望日勤", date: "6/6", notes: "" }],
      supplyExclusions: [],
      previousMonthTailByName: {},
      currentSchedule: [{ role: "介護", name: "北富", shifts: ["日"] }],
      },
    }),
  );
  assertEqual(gasImported.viewModel.status.label, "GASデータを取り込みました", "gas import status");
  assertEqual(gasImported.document.staff[0].name, "北富", "gas import staff");
  assertEqual(gasImported.document.requests[0].startDate, "2026-06-06", "gas import request");

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
  recoverCalls: RecoverScheduleRequest[] = [];

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

  async recoverSchedule(request: RecoverScheduleRequest): Promise<RecoverScheduleResponse> {
    this.recoverCalls.push(request);
    const document = applySolverOutputToDocument(sampleMonthlyScheduleDocument, sampleSolverOutputWithAdvisory);
    return {
      ok: true,
      document,
      diagnostics: document.diagnostics!,
      messages: document.diagnostics!.messages,
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
