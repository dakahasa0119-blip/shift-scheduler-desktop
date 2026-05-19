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
  assertIncludes(html, '<textarea id="schedule-tsv"', "schedule tsv editor");
  assertIncludes(html, 'data-settings-field="requirements.late"', "settings editor");
  assertIncludes(html, 'actions = {', "interactive script");
  assertIncludes(html, 'actionBasePath = "/preview"', "default action base path");
  assertIncludes(html, 'solve: actionBasePath + "/solve"', "solve endpoint");
  assertIncludes(html, 'save: actionBasePath + "/save"', "save endpoint");
  assertIncludes(html, 'load: actionBasePath + "/load"', "load endpoint");
  assertIncludes(html, 'backup: actionBasePath + "/backup"', "backup endpoint");
  assertIncludes(html, 'applySettings: actionBasePath + "/import/settings"', "settings endpoint");
  assertIncludes(html, 'applyScheduleTsv: actionBasePath + "/import/schedule-tsv"', "schedule tsv import endpoint");
  assertIncludes(html, 'exportScheduleTsv: actionBasePath + "/export/schedule-tsv"', "schedule tsv export endpoint");
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
