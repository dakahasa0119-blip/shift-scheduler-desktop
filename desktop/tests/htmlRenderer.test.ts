import { MockSolverRunner } from "../api/mockSolverRunner";
import { handleSolveSchedule } from "../api/handlers";
import { buildAppViewModelFromSolveResponse } from "../app/appViewModel";
import { renderAppHtml } from "../app/htmlRenderer";
import { sampleMonthlyScheduleDocument } from "../core/fixtures";

async function main(): Promise<void> {
  const response = await handleSolveSchedule(
    {
      document: sampleMonthlyScheduleDocument,
      options: {
        mode: "create",
        timeLimitSeconds: 10,
      },
    },
    {
      appVersion: "0.1.0-test",
      now: () => new Date(2026, 4, 19, 20, 0, 0),
      solver: new MockSolverRunner(),
    },
  );
  const viewModel = buildAppViewModelFromSolveResponse(sampleMonthlyScheduleDocument, response);
  const html = renderAppHtml(viewModel, { interactive: true });

  assertIncludes(html, '<html lang="ja">', "html language");
  assertIncludes(html, "<h1>勤務表作成</h1>", "title");
  assertIncludes(html, "作成できました（確認事項あり）", "status");
  assertIncludes(html, 'data-section="shortages"', "shortage section");
  assertIncludes(html, "6/3 遅 1名不足", "shortage text");
  assertIncludes(html, '<th class="sticky role-col" scope="col">職種</th>', "role header");
  assertIncludes(html, '<th class="sticky name-col" scope="col">氏名</th>', "name header");
  assertIncludes(html, 'class="shift shift-requestUnmet"', "unmet request cell");
  assertIncludes(html, 'data-request="希望日勤"', "request label");
  assertIncludes(html, '<button type="button" class="action action-exportExcel" data-action="exportExcel">Excel出力</button>', "export button");
  assertIncludes(html, '<textarea id="document-json"', "document json editor");
  assertIncludes(html, '<textarea id="staff-tsv"', "staff tsv editor");
  assertIncludes(html, '<textarea id="requests-tsv"', "requests tsv editor");
  assertIncludes(html, '<textarea id="urgent-leave-tsv"', "urgent leave tsv editor");
  assertIncludes(html, '<select id="leave-staff-name"', "leave staff selector");
  assertIncludes(html, '<select id="leave-type"', "leave type selector");
  assertIncludes(html, '<button type="button" class="action action-addLeaveRequest" data-action="addLeaveRequest">休暇・希望を登録</button>', "leave request button");
  assertIncludes(html, '<select id="cancel-planned-leave-index"', "planned leave cancel selector");
  assertIncludes(html, '<select id="cancel-urgent-leave-index"', "urgent leave cancel selector");
  assertIncludes(html, '<button type="button" class="action action-cancelPlannedLeave" data-action="cancelPlannedLeave">事前休暇を取り消し</button>', "planned cancel button");
  assertIncludes(html, '<button type="button" class="action action-cancelUrgentLeave" data-action="cancelUrgentLeave">急遽休を取り消し</button>', "urgent cancel button");
  assertIncludes(html, '<input id="recovery-fixed-through-date"', "recovery fixed date");
  assertIncludes(html, '<textarea id="schedule-tsv"', "schedule tsv editor");
  assertIncludes(html, '<textarea id="actual-schedule-tsv"', "actual tsv editor");
  assertIncludes(html, '<textarea id="change-history-tsv"', "change history tsv editor");
  assertIncludes(html, '<textarea id="capacity-simulation-json"', "capacity simulation editor");
  assertIncludes(html, 'data-settings-field="requirements.late"', "settings editor");
  assertIncludes(html, 'actions = {', "interactive script");
  assertIncludes(html, 'actionBasePath = "/preview"', "default action base path");
  assertIncludes(html, 'solve: actionBasePath + "/solve"', "solve endpoint");
  assertIncludes(html, 'postEditRecheck: actionBasePath + "/post-edit-recheck"', "post edit endpoint");
  assertIncludes(html, 'recover: actionBasePath + "/recover"', "recover endpoint");
  assertIncludes(html, 'addLeaveRequest: actionBasePath + "/add-leave-request"', "leave endpoint");
  assertIncludes(html, 'cancelPlannedLeave: actionBasePath + "/cancel-planned-leave"', "planned cancel endpoint");
  assertIncludes(html, 'cancelUrgentLeave: actionBasePath + "/cancel-urgent-leave"', "urgent cancel endpoint");
  assertIncludes(html, 'save: actionBasePath + "/save"', "save endpoint");
  assertIncludes(html, 'load: actionBasePath + "/load"', "load endpoint");
  assertIncludes(html, 'backup: actionBasePath + "/backup"', "backup endpoint");
  assertIncludes(html, 'applySettings: actionBasePath + "/import/settings"', "settings endpoint");
  assertIncludes(html, 'applyStaffTsv: actionBasePath + "/import/staff-tsv"', "staff tsv import endpoint");
  assertIncludes(html, 'exportStaffTsv: actionBasePath + "/export/staff-tsv"', "staff tsv export endpoint");
  assertIncludes(html, 'applyRequestsTsv: actionBasePath + "/import/requests-tsv"', "requests tsv import endpoint");
  assertIncludes(html, 'exportRequestsTsv: actionBasePath + "/export/requests-tsv"', "requests tsv export endpoint");
  assertIncludes(html, 'applyScheduleTsv: actionBasePath + "/import/schedule-tsv"', "schedule tsv import endpoint");
  assertIncludes(html, 'exportScheduleTsv: actionBasePath + "/export/schedule-tsv"', "schedule tsv export endpoint");
  assertIncludes(html, 'applyActualScheduleTsv: actionBasePath + "/import/actual-schedule-tsv"', "actual tsv import endpoint");
  assertIncludes(html, 'exportChangeHistoryTsv: actionBasePath + "/export/change-history-tsv"', "history tsv export endpoint");
  assertIncludes(html, 'exportAiDebugJson: actionBasePath + "/export/ai-debug-json"', "ai debug export endpoint");
  assertIncludes(html, 'runCapacitySimulation: actionBasePath + "/run-capacity-simulation"', "capacity run endpoint");
  assertIncludes(html, 'importCapacitySimulationJson: actionBasePath + "/import/capacity-simulation-json"', "capacity import endpoint");
  assertIncludes(html, 'exportCapacitySimulationJson: actionBasePath + "/export/capacity-simulation-json"', "capacity export endpoint");
  assertIncludes(html, 'applyJson: actionBasePath + "/import/json"', "json import endpoint");
  assertIncludes(html, 'exportJson: actionBasePath + "/export/json"', "json export endpoint");
  assertIncludes(html, 'exportExcel: actionBasePath + "/export/excel"', "export endpoint");
  assertIncludes(html, 'exportPdf: actionBasePath + "/export/pdf"', "pdf endpoint");
}

function assertIncludes(text: string, expected: string, label: string): void {
  if (!text.includes(expected)) {
    throw new Error(`${label}: missing ${expected}`);
  }
}

main().catch((error) => {
  console.error(error);
  throw error;
});
