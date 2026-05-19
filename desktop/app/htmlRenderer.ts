import type { AppActionViewModel, AppViewModel } from "./appViewModel";
import type { DiagnosticItemViewModel, DiagnosticSectionViewModel } from "./diagnosticViewModel";
import type { ScheduleCellViewModel, ScheduleStaffRowViewModel } from "./scheduleTableViewModel";

export interface AppHtmlRenderOptions {
  interactive?: boolean;
  actionBasePath?: string;
}

export function renderAppHtml(viewModel: AppViewModel, options: AppHtmlRenderOptions = {}): string {
  return [
    "<!doctype html>",
    '<html lang="ja">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(viewModel.title)}</title>`,
    "<style>",
    renderCss(),
    "</style>",
    "</head>",
    "<body>",
    '<main class="app-shell">',
    renderTopBar(viewModel),
    renderWorkspace(viewModel),
    "</main>",
    options.interactive ? renderClientScript(options.actionBasePath || "/preview") : "",
    "</body>",
    "</html>",
  ].join("\n");
}

function renderWorkspace(viewModel: AppViewModel): string {
  return [
    '<section class="workspace" aria-label="勤務表作成ワークスペース">',
    '<div class="primary-column">',
    renderMonthlyOverview(viewModel),
    renderSchedule(viewModel),
    renderDataWorkspace(viewModel),
    "</div>",
    '<aside class="side-rail" aria-label="操作と確認">',
    renderOperationPanel(viewModel),
    renderWorkflowPanel(viewModel),
    renderCapacitySimulation(viewModel),
    renderDiagnostics(viewModel),
    "</aside>",
    "</section>",
  ].join("");
}

function renderMonthlyOverview(viewModel: AppViewModel): string {
  const activeRows = viewModel.schedule.rows.filter((row) => row.cells.some((cell) => cell.shift));
  const requestCount = viewModel.requestsTsv
    .split("\n")
    .slice(1)
    .filter((line) => line.trim()).length;
  const shortageCount = buildDailyCoverage(viewModel).reduce((sum, day) => sum + day.shortages.length, 0);
  const nightCount = activeRows.reduce((sum, row) => sum + countRowShifts(row).night, 0);
  const resultLabel = viewModel.diagnostics?.result.label || viewModel.status.label;
  return [
    '<section class="monthly-overview" aria-label="運用サマリー">',
    renderOverviewMetric("対象月", `${viewModel.settings.year}年${viewModel.settings.month}月`),
    renderOverviewMetric("職員", `${activeRows.length}名 / 登録${viewModel.schedule.rows.length}名`),
    renderOverviewMetric("希望", `${requestCount}件`),
    renderOverviewMetric("夜勤", `${nightCount}枠`),
    renderOverviewMetric("不足", shortageCount ? `${shortageCount}件` : "なし", shortageCount ? "blocked" : "ready"),
    renderOverviewMetric("運用判定", resultLabel, viewModel.status.tone === "blocked" ? "blocked" : "neutral"),
    "</section>",
  ].join("");
}

function renderOverviewMetric(label: string, value: string, tone: "ready" | "blocked" | "neutral" = "neutral"): string {
  return `<div class="overview-metric overview-${tone}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function renderOperationPanel(viewModel: AppViewModel): string {
  return [
    '<section class="operation-panel" aria-label="操作">',
    '<div class="operation-group operation-primary">',
    '<h2>月次作成</h2>',
    '<div class="button-grid">',
    renderActionById(viewModel, "validate"),
    renderActionById(viewModel, "monthlyPrecheck"),
    renderActionById(viewModel, "runMonthlyTransition"),
    renderActionById(viewModel, "archiveCurrentMonth"),
    renderActionById(viewModel, "startNextMonthPlanning"),
    renderActionById(viewModel, "promoteOperationMonth"),
    renderActionById(viewModel, "repairCalendar"),
    renderActionById(viewModel, "checkSolverConnection"),
    renderActionById(viewModel, "postEditRecheck"),
    renderActionById(viewModel, "solve"),
    renderActionById(viewModel, "createActual"),
    renderActionById(viewModel, "save"),
    renderActionById(viewModel, "load"),
    "</div>",
    "</div>",
    '<div class="operation-group">',
    '<h2>急休</h2>',
    renderLeaveRequestForm(viewModel),
    renderLeaveCancelForms(viewModel),
    renderUrgentLeaveEditor(viewModel),
    renderActionById(viewModel, "addLeaveRequest"),
    renderActionById(viewModel, "cancelPlannedLeave"),
    renderActionById(viewModel, "cancelUrgentLeave"),
    renderActionById(viewModel, "recover"),
    "</div>",
    '<div class="operation-group">',
    '<h2>出力</h2>',
    '<div class="button-grid">',
    renderActionById(viewModel, "backup"),
    renderActionById(viewModel, "exportExcel"),
    renderActionById(viewModel, "exportPdf"),
    renderActionById(viewModel, "exportAiDebugJson"),
    renderActionById(viewModel, "exportJson"),
    "</div>",
    "</div>",
    "</section>",
  ].join("");
}

function renderWorkflowPanel(viewModel: AppViewModel): string {
  const hasDiagnostics = Boolean(viewModel.diagnostics);
  const blocked = viewModel.status.tone === "blocked";
  const steps = [
    { label: "入力確認", detail: "職員条件、希望、勤務表の形式を確認", state: "ready" },
    { label: "勤務表作成", detail: "Solverで作成し、停止理由と注意事項を確認", state: hasDiagnostics ? (blocked ? "blocked" : "ready") : "pending" },
    { label: "配布前確認", detail: "不足、未充足希望、修正候補を確認", state: hasDiagnostics ? (blocked ? "blocked" : "ready") : "pending" },
    { label: "勤務実績作成", detail: "配布用勤務表を実績シートへコピー", state: "pending" },
    { label: "急休対応", detail: "当日急休は実績へ反映し、必要時にリカバリー", state: "pending" },
    { label: "月次切替", detail: "勤務表・実績・履歴をアーカイブして次月へ", state: "pending" },
  ];
  return [
    '<section class="workflow-panel" aria-label="運用フロー">',
    "<h2>運用フロー</h2>",
    `<p class="operation-status">運用 ${escapeHtml(viewModel.operation.currentOperationYearMonth)} / 作成 ${escapeHtml(viewModel.operation.currentTargetYearMonth)} / 保存 ${escapeHtml(viewModel.operation.lastArchivedYearMonth || "-")} / アーカイブ ${viewModel.operation.archiveCount}件</p>`,
    '<div class="workflow-list">',
    steps
      .map(
        (step, index) =>
          `<div class="workflow-step workflow-${step.state}"><span>${index + 1}</span><strong>${escapeHtml(step.label)}</strong><small>${escapeHtml(step.detail)}</small></div>`,
      )
      .join(""),
    "</div>",
    "</section>",
  ].join("");
}

function renderCapacitySimulation(viewModel: AppViewModel): string {
  if (!viewModel.capacitySimulation) return "";
  const summaries = viewModel.capacitySimulation.summaries.slice(0, 4);
  const details = viewModel.capacitySimulation.results.slice(0, 8);
  return [
    '<section class="capacity-panel" aria-label="体制シミュレーション">',
    "<h2>体制シミュレーション</h2>",
    '<div class="capacity-table-wrap">',
    '<table class="preview-table capacity-table">',
    "<thead><tr><th>体制案</th><th>必要枠</th><th>最低成立</th><th>運用可能</th><th>安定目安</th><th>主な制約</th></tr></thead><tbody>",
    summaries.map((item) => [
      "<tr>",
      `<td>${escapeHtml(item.planLabel)}</td>`,
      `<td>${escapeHtml(formatRequired(item.requiredShiftStaffing))}</td>`,
      `<td>${escapeHtml(formatAdditional(item.minimumAdditionalStaff))}</td>`,
      `<td>${escapeHtml(formatAdditional(item.operationalAdditionalStaff))}</td>`,
      `<td>${escapeHtml(formatAdditional(item.stableAdditionalStaff))}</td>`,
      `<td>${escapeHtml(item.mainBottlenecks.join(" / "))}</td>`,
      "</tr>",
    ].join("")).join(""),
    "</tbody></table>",
    "</div>",
    '<div class="capacity-table-wrap compact">',
    '<table class="preview-table capacity-table">',
    "<thead><tr><th>体制案</th><th>追加職員</th><th>判定</th><th>不足</th><th>主な制約</th></tr></thead><tbody>",
    details.map((item) => [
      "<tr>",
      `<td>${escapeHtml(item.planLabel)}</td>`,
      `<td>${escapeHtml(formatAdditional(item.additionalStaffCount))}</td>`,
      `<td>${escapeHtml(item.classification)}</td>`,
      `<td>${item.shortageCount}</td>`,
      `<td>${escapeHtml(item.bottlenecks.join(" / "))}</td>`,
      "</tr>",
    ].join("")).join(""),
    "</tbody></table>",
    "</div>",
    "</section>",
  ].join("");
}

function formatRequired(required: Record<string, number>): string {
  return `早${required["早"] || 0} 日${required["日"] || 0} 遅${required["遅"] || 0} 夜${required["夜"] || 0}`;
}

function formatAdditional(value: number | null): string {
  if (value === null || value === undefined) return "-";
  return value === 0 ? "現在人員" : `+${value}名`;
}

function renderDataWorkspace(viewModel: AppViewModel): string {
  return [
    '<section class="data-workspace" aria-label="入力データ">',
    '<input class="tab-input" type="radio" name="data-tab" id="tab-settings" checked>',
    '<input class="tab-input" type="radio" name="data-tab" id="tab-staff">',
    '<input class="tab-input" type="radio" name="data-tab" id="tab-requests">',
    '<input class="tab-input" type="radio" name="data-tab" id="tab-schedule">',
    '<input class="tab-input" type="radio" name="data-tab" id="tab-actual">',
    '<input class="tab-input" type="radio" name="data-tab" id="tab-history">',
    '<input class="tab-input" type="radio" name="data-tab" id="tab-capacity">',
    '<input class="tab-input" type="radio" name="data-tab" id="tab-solver">',
    '<input class="tab-input" type="radio" name="data-tab" id="tab-json">',
    '<div class="tab-list" role="tablist" aria-label="入力データ切替">',
    '<label class="tab-button" for="tab-settings" role="tab">基本設定</label>',
    '<label class="tab-button" for="tab-staff" role="tab">職員</label>',
    '<label class="tab-button" for="tab-requests" role="tab">希望</label>',
    '<label class="tab-button" for="tab-schedule" role="tab">勤務表TSV</label>',
    '<label class="tab-button" for="tab-actual" role="tab">勤務実績</label>',
    '<label class="tab-button" for="tab-history" role="tab">履歴</label>',
    '<label class="tab-button" for="tab-capacity" role="tab">体制</label>',
    '<label class="tab-button" for="tab-solver" role="tab">Solver</label>',
    '<label class="tab-button" for="tab-json" role="tab">JSON</label>',
    "</div>",
    '<div class="tab-panels">',
    `<div class="tab-panel panel-settings">${renderSettingsEditor(viewModel)}${renderActionById(viewModel, "applySettings")}</div>`,
    `<div class="tab-panel panel-staff">${renderStaffOverview(viewModel)}${renderStaffTsvEditor(viewModel)}<div class="button-row">${renderActionById(viewModel, "applyStaffTsv")}${renderActionById(viewModel, "exportStaffTsv")}</div></div>`,
    `<div class="tab-panel panel-requests">${renderRequestsOverview(viewModel)}${renderRequestsTsvEditor(viewModel)}<div class="button-row">${renderActionById(viewModel, "applyRequestsTsv")}${renderActionById(viewModel, "exportRequestsTsv")}</div></div>`,
    `<div class="tab-panel panel-schedule">${renderScheduleTsvEditor(viewModel)}<div class="button-row">${renderActionById(viewModel, "applyScheduleTsv")}${renderActionById(viewModel, "exportScheduleTsv")}</div></div>`,
    `<div class="tab-panel panel-actual">${renderActualScheduleTsvEditor(viewModel)}<div class="button-row">${renderActionById(viewModel, "createActual")}${renderActionById(viewModel, "applyActualScheduleTsv")}${renderActionById(viewModel, "exportActualScheduleTsv")}</div></div>`,
    `<div class="tab-panel panel-history">${renderHistoryTsvEditor(viewModel)}<div class="button-row">${renderActionById(viewModel, "ensureHistory")}${renderActionById(viewModel, "exportChangeHistoryTsv")}${renderActionById(viewModel, "exportUrgentLeaveHistoryTsv")}</div></div>`,
    `<div class="tab-panel panel-capacity">${renderCapacityJsonEditor(viewModel)}<div class="button-row">${renderActionById(viewModel, "runCapacitySimulation")}${renderActionById(viewModel, "refreshCapacitySimulation")}${renderActionById(viewModel, "importCapacitySimulationJson")}${renderActionById(viewModel, "exportCapacitySimulationJson")}</div></div>`,
    `<div class="tab-panel panel-solver">${renderSolverJsonEditor(viewModel)}<div class="button-row">${renderActionById(viewModel, "checkSolverConnection")}${renderActionById(viewModel, "importSolverOutputJson")}${renderActionById(viewModel, "exportSolverInputJson")}</div></div>`,
    `<div class="tab-panel panel-json">${renderDocumentEditor(viewModel)}<div class="button-row">${renderActionById(viewModel, "applyJson")}${renderActionById(viewModel, "exportJson")}</div></div>`,
    "</div>",
    "</section>",
  ].join("");
}

function renderStaffOverview(viewModel: AppViewModel): string {
  const rows = parseTsv(viewModel.staffTsv).rows.filter((row) => row.some((cell) => cell.trim()));
  if (!rows.length) return "";
  return [
    '<section class="data-preview" aria-label="職員条件サマリー">',
    '<div class="section-heading compact">',
    '<h2>職員条件</h2>',
    `<span>${rows.length}名</span>`,
    "</div>",
    '<div class="preview-wrap">',
    '<table class="preview-table staff-preview">',
    "<thead><tr>",
    ["区分", "氏名", "夜勤条件", "可能シフト", "曜日", "性別"].map((label) => `<th>${escapeHtml(label)}</th>`).join(""),
    "</tr></thead><tbody>",
    rows
      .map((row) => {
        const weekdays = row.slice(4, 11).map((value, index) => (normalizeBoolean(value) ? ["月", "火", "水", "木", "金", "土", "日"][index] : "")).filter(Boolean);
        return [
          "<tr>",
          `<td>${escapeHtml(row[0] || "")}</td>`,
          `<td><strong>${escapeHtml(row[1] || "")}</strong></td>`,
          `<td>${escapeHtml(row[2] || "")}</td>`,
          `<td>${renderShiftChips(row[3] || "")}</td>`,
          `<td class="weekday-list">${escapeHtml(weekdays.join(" "))}</td>`,
          `<td>${escapeHtml(row[12] || "")}</td>`,
          "</tr>",
        ].join("");
      })
      .join(""),
    "</tbody></table>",
    "</div>",
    "</section>",
  ].join("");
}

function renderRequestsOverview(viewModel: AppViewModel): string {
  const parsed = parseTsv(viewModel.requestsTsv);
  const rows = parsed.rows.filter((row) => row.some((cell) => cell.trim()));
  if (!rows.length) return "";
  const counts = rows.reduce<Record<string, number>>((acc, row) => {
    const type = row[1] || "未分類";
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});
  return [
    '<section class="data-preview" aria-label="希望サマリー">',
    '<div class="section-heading compact">',
    '<h2>希望・供給除外</h2>',
    `<span>${rows.length}件</span>`,
    "</div>",
    '<div class="request-summary">',
    Object.entries(counts)
      .map(([type, count]) => `<span class="request-pill request-${requestKind(type)}">${escapeHtml(type)} <strong>${count}</strong></span>`)
      .join(""),
    "</div>",
    renderRequestLegend(),
    '<div class="preview-wrap compact-table">',
    '<table class="preview-table request-preview">',
    "<thead><tr>",
    ["氏名", "区分", "開始", "終了", "備考"].map((label) => `<th>${escapeHtml(label)}</th>`).join(""),
    "</tr></thead><tbody>",
    rows
      .slice(0, 18)
      .map((row) =>
        [
          "<tr>",
          `<td><strong>${escapeHtml(row[0] || "")}</strong></td>`,
          `<td><span class="request-type request-${requestKind(row[1] || "")}">${escapeHtml(row[1] || "")}</span></td>`,
          `<td>${escapeHtml(row[2] || "")}</td>`,
          `<td>${escapeHtml(row[3] || "")}</td>`,
          `<td>${escapeHtml(row[4] || "")}</td>`,
          "</tr>",
        ].join(""),
      )
      .join(""),
    "</tbody></table>",
    "</div>",
    "</section>",
  ].join("");
}

function renderRequestLegend(): string {
  return [
    '<div class="request-legend" aria-label="希望区分の扱い">',
    '<span><strong class="legend-hard"></strong>休暇・公休系は必ず守る</span>',
    '<span><strong class="legend-work"></strong>勤務希望は未充足でも確認事項</span>',
    '<span><strong class="legend-exclusion"></strong>供給除外は公休数に含めない</span>',
    '<span><strong class="legend-urgent"></strong>当日急休は勤務実績側で扱う</span>',
    "</div>",
  ].join("");
}

function requestKind(type: string): "hard" | "work" | "exclusion" | "urgent" | "other" {
  if (type === "事前希望休" || type === "有給" || type === "特別休") return "hard";
  if (type === "希望早出" || type === "希望日勤" || type === "希望遅出" || type === "希望夜勤") return "work";
  if (type === "出張" || type === "産休" || type === "育休" || type === "休職" || type === "長期病欠" || type === "入職前" || type === "退職後" || type === "供給除外") {
    return "exclusion";
  }
  if (type === "当日急遽休" || type === "当日特別休") return "urgent";
  return "other";
}

function renderShiftChips(value: string): string {
  const shifts = value.split(/[・,、\s]+/).map((item) => item.trim()).filter(Boolean);
  if (!shifts.length) return "";
  return shifts.map((shift) => `<span class="shift-chip">${escapeHtml(shift)}</span>`).join("");
}

function normalizeBoolean(value: string): boolean {
  return String(value || "").trim().toLowerCase() === "true";
}

function parseTsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = String(text || "").split(/\r?\n/).filter((line) => line.length > 0);
  const headers = lines[0]?.split("\t") || [];
  const rows = lines.slice(1).map((line) => line.split("\t"));
  return { headers, rows };
}

function renderActionById(viewModel: AppViewModel, id: AppActionViewModel["id"]): string {
  const action = viewModel.actions.find((item) => item.id === id);
  return action ? renderActionButton(action) : "";
}

function renderSettingsEditor(viewModel: AppViewModel): string {
  return [
    '<section class="settings-editor" aria-label="基本設定">',
    '<h2>基本設定</h2>',
    '<div class="settings-grid">',
    renderNumberField("年", "year", viewModel.settings.year),
    renderNumberField("月", "month", viewModel.settings.month),
    renderNumberField("早", "requirements.early", viewModel.settings.requirements.early),
    renderNumberField("日", "requirements.day", viewModel.settings.requirements.day),
    renderNumberField("遅", "requirements.late", viewModel.settings.requirements.late),
    renderNumberField("夜", "requirements.night", viewModel.settings.requirements.night),
    "</div>",
    "</section>",
  ].join("");
}

function renderNumberField(label: string, field: string, value: number): string {
  return `<label><span>${escapeHtml(label)}</span><input type="number" data-settings-field="${escapeHtml(field)}" value="${escapeHtml(String(value))}"></label>`;
}

function renderDocumentEditor(viewModel: AppViewModel): string {
  return [
    '<section class="document-editor" aria-label="データ">',
    '<h2>データ</h2>',
    `<textarea id="document-json" spellcheck="false">${escapeHtml(viewModel.documentJson)}</textarea>`,
    "</section>",
  ].join("");
}

function renderScheduleTsvEditor(viewModel: AppViewModel): string {
  return [
    '<section class="tsv-editor" aria-label="勤務表TSV">',
    '<h2>勤務表TSV</h2>',
    `<textarea id="schedule-tsv" spellcheck="false">${escapeHtml(viewModel.scheduleTsv)}</textarea>`,
    "</section>",
  ].join("");
}

function renderActualScheduleTsvEditor(viewModel: AppViewModel): string {
  return [
    '<section class="tsv-editor" aria-label="勤務実績TSV">',
    '<h2>勤務実績</h2>',
    `<textarea id="actual-schedule-tsv" spellcheck="false">${escapeHtml(viewModel.actualScheduleTsv)}</textarea>`,
    "</section>",
  ].join("");
}

function renderHistoryTsvEditor(viewModel: AppViewModel): string {
  return [
    '<section class="tsv-editor" aria-label="変更履歴TSV">',
    '<h2>変更履歴</h2>',
    `<textarea id="change-history-tsv" spellcheck="false" readonly>${escapeHtml(viewModel.changeHistoryTsv)}</textarea>`,
    "</section>",
    '<section class="tsv-editor" aria-label="急休履歴TSV">',
    '<h2>急休履歴</h2>',
    `<textarea id="urgent-leave-history-tsv" spellcheck="false" readonly>${escapeHtml(viewModel.urgentLeaveHistoryTsv)}</textarea>`,
    "</section>",
  ].join("");
}

function renderCapacityJsonEditor(viewModel: AppViewModel): string {
  return [
    '<section class="tsv-editor" aria-label="体制シミュレーションJSON">',
    '<h2>体制シミュレーションJSON</h2>',
    `<textarea id="capacity-simulation-json" spellcheck="false">${escapeHtml(viewModel.capacitySimulationJson)}</textarea>`,
    "</section>",
  ].join("");
}

function renderSolverJsonEditor(viewModel: AppViewModel): string {
  return [
    '<section class="tsv-editor" aria-label="Solver入力JSON">',
    '<h2>Solver入力JSON</h2>',
    `<textarea id="solver-input-json" spellcheck="false" readonly>${escapeHtml(viewModel.solverInputJson)}</textarea>`,
    "</section>",
    '<section class="tsv-editor" aria-label="Solver結果JSON">',
    '<h2>Solver結果JSON</h2>',
    '<textarea id="solver-output-json" spellcheck="false"></textarea>',
    "</section>",
  ].join("");
}

function renderStaffTsvEditor(viewModel: AppViewModel): string {
  return [
    '<section class="tsv-editor" aria-label="職員一覧TSV">',
    '<h2>職員一覧</h2>',
    `<textarea id="staff-tsv" spellcheck="false">${escapeHtml(viewModel.staffTsv)}</textarea>`,
    "</section>",
  ].join("");
}

function renderRequestsTsvEditor(viewModel: AppViewModel): string {
  return [
    '<section class="tsv-editor" aria-label="希望休・希望勤務TSV">',
    '<h2>希望休・希望勤務</h2>',
    `<textarea id="requests-tsv" spellcheck="false">${escapeHtml(viewModel.requestsTsv)}</textarea>`,
    "</section>",
  ].join("");
}

function renderUrgentLeaveEditor(viewModel: AppViewModel): string {
  return [
    '<section class="tsv-editor recovery-editor" aria-label="急休リカバリー">',
    '<h2>急休リカバリー</h2>',
    '<div class="recovery-grid">',
    `<label><span>固定終了日</span><input id="recovery-fixed-through-date" type="date" value=""></label>`,
    "</div>",
    `<textarea id="urgent-leave-tsv" spellcheck="false">${escapeHtml(viewModel.urgentLeaveTsv)}</textarea>`,
    "</section>",
  ].join("");
}

function renderLeaveRequestForm(viewModel: AppViewModel): string {
  const staffOptions = viewModel.schedule.rows
    .map((row) => `<option value="${escapeHtml(row.name)}">${escapeHtml(row.name)}</option>`)
    .join("");
  const types = [
    "事前希望休",
    "有給",
    "特別休",
    "希望早出",
    "希望日勤",
    "希望遅出",
    "希望夜勤",
    "当日急遽休",
    "当日特別休",
    "出張",
    "産休",
    "育休",
    "休職",
    "長期病欠",
    "入職前",
    "退職後",
    "供給除外",
  ];
  return [
    '<section class="leave-form" aria-label="休暇・希望勤務入力">',
    '<div class="leave-grid">',
    `<label><span>氏名</span><select id="leave-staff-name">${staffOptions}</select></label>`,
    `<label><span>区分</span><select id="leave-type">${types.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join("")}</select></label>`,
    `<label><span>開始日</span><input id="leave-start-date" type="date" value=""></label>`,
    `<label><span>終了日</span><input id="leave-end-date" type="date" value=""></label>`,
    '<label class="wide"><span>備考</span><input id="leave-notes" type="text" value=""></label>',
    "</div>",
    "</section>",
  ].join("");
}

function renderLeaveCancelForms(viewModel: AppViewModel): string {
  const plannedOptions = renderSelectOptions(viewModel.plannedLeaveCancelOptions);
  const urgentOptions = renderSelectOptions(viewModel.urgentLeaveCancelOptions);
  return [
    '<section class="leave-cancel" aria-label="休暇取消">',
    '<div class="leave-grid">',
    '<label class="wide"><span>事前休暇取消</span>',
    `<select id="cancel-planned-leave-index">${plannedOptions || '<option value="">対象なし</option>'}</select>`,
    "</label>",
    '<label class="wide"><span>急遽休取消</span>',
    `<select id="cancel-urgent-leave-index">${urgentOptions || '<option value="">対象なし</option>'}</select>`,
    "</label>",
    "</div>",
    "</section>",
  ].join("");
}

function renderSelectOptions(options: { value: string; label: string }[]): string {
  return options
    .map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
    .join("");
}

function renderTopBar(viewModel: AppViewModel): string {
  return [
    '<header class="top-bar">',
    '<div class="title-group">',
    `<h1>${escapeHtml(viewModel.title)}</h1>`,
    `<p class="status status-${viewModel.status.tone}">${escapeHtml(viewModel.status.label)}</p>`,
    "</div>",
    '<nav class="action-bar" aria-label="主要操作">',
    renderActionById(viewModel, "validate"),
    renderActionById(viewModel, "solve"),
    renderActionById(viewModel, "exportExcel"),
    renderActionById(viewModel, "exportPdf"),
    renderActionById(viewModel, "quit"),
    "</nav>",
    "</header>",
  ].join("");
}

function renderActionButton(action: AppActionViewModel): string {
  const disabled = action.enabled ? "" : " disabled";
  return `<button type="button" class="action action-${action.id}" data-action="${action.id}"${disabled}>${escapeHtml(action.label)}</button>`;
}

function renderDiagnostics(viewModel: AppViewModel): string {
  if (viewModel.validationIssues.length > 0) {
    return [
      '<section class="diagnostics" aria-label="入力確認">',
      '<h2>入力確認</h2>',
      '<div class="diagnostic-list">',
      viewModel.validationIssues
        .map((issue) =>
          `<article class="diagnostic-item diagnostic-${issue.severity}"><strong>${escapeHtml(issue.message)}</strong><span>${escapeHtml(issue.path)}</span></article>`,
        )
        .join(""),
      "</div>",
      "</section>",
    ].join("");
  }

  if (!viewModel.diagnostics) return "";

  return [
    '<section class="diagnostics" aria-label="確認事項">',
    '<h2>確認事項</h2>',
    '<div class="diagnostic-grid">',
    viewModel.diagnostics.sections.map(renderDiagnosticSection).join(""),
    "</div>",
    "</section>",
  ].join("");
}

function renderDiagnosticSection(section: DiagnosticSectionViewModel): string {
  return [
    `<article class="diagnostic-section diagnostic-${section.severity}" data-section="${section.id}">`,
    `<h3>${escapeHtml(section.title)}</h3>`,
    '<div class="diagnostic-list">',
    section.items.map(renderDiagnosticItem).join(""),
    "</div>",
    "</article>",
  ].join("");
}

function renderDiagnosticItem(item: DiagnosticItemViewModel): string {
  return [
    `<div class="diagnostic-item diagnostic-${item.severity}">`,
    `<strong>${escapeHtml(item.primary)}</strong>`,
    item.secondary ? `<span>${escapeHtml(item.secondary)}</span>` : "",
    "</div>",
  ].join("");
}

function renderSchedule(viewModel: AppViewModel): string {
  const coverage = buildDailyCoverage(viewModel);
  return [
    '<section class="schedule-section" aria-label="勤務表">',
    '<div class="section-heading">',
    `<h2>${escapeHtml(viewModel.schedule.title)}</h2>`,
    '<span>GAS本番シートと同じ横持ち勤務表</span>',
    "</div>",
    '<div class="schedule-wrap">',
    '<table class="schedule-table">',
    "<thead>",
    "<tr>",
    '<th class="sticky role-col" scope="col">職種</th>',
    '<th class="sticky name-col" scope="col">氏名</th>',
    viewModel.schedule.days.map((day) => `<th class="${day.weekend ? "weekend" : ""}" scope="col">${day.day}</th>`).join(""),
    renderSummaryHeader("早"),
    renderSummaryHeader("日"),
    renderSummaryHeader("遅"),
    renderSummaryHeader("夜"),
    renderSummaryHeader("明"),
    renderSummaryHeader("公"),
    renderSummaryHeader("休"),
    renderSummaryHeader("空"),
    "</tr>",
    "<tr>",
    '<th class="sticky role-col subhead" scope="col"></th>',
    '<th class="sticky name-col subhead" scope="col"></th>',
    viewModel.schedule.days
      .map((day) => `<th class="weekday ${day.weekend ? "weekend" : ""}" scope="col">${escapeHtml(day.weekday)}</th>`)
      .join(""),
    '<th class="summary-head" scope="col">早</th>',
    '<th class="summary-head" scope="col">日</th>',
    '<th class="summary-head" scope="col">遅</th>',
    '<th class="summary-head" scope="col">夜</th>',
    '<th class="summary-head" scope="col">明</th>',
    '<th class="summary-head" scope="col">公</th>',
    '<th class="summary-head" scope="col">休有特</th>',
    '<th class="summary-head" scope="col">空</th>',
    "</tr>",
    "</thead>",
    "<tbody>",
    viewModel.schedule.rows
      .map((row) =>
        [
          "<tr>",
          `<th class="sticky role-col" scope="row">${escapeHtml(row.role)}</th>`,
          `<th class="sticky name-col" scope="row">${escapeHtml(row.name)}</th>`,
          row.cells.map(renderScheduleCell).join(""),
          renderRowSummary(row),
          "</tr>",
        ].join(""),
      )
      .join(""),
    renderCoverageRows(viewModel, coverage),
    "</tbody>",
    "</table>",
    "</div>",
    "</section>",
  ].join("");
}

function renderSummaryHeader(label: string): string {
  return `<th class="summary-head" scope="col">${escapeHtml(label)}</th>`;
}

interface ShiftCounts {
  early: number;
  day: number;
  late: number;
  night: number;
  afterNight: number;
  off: number;
  leave: number;
  blank: number;
}

function countRowShifts(row: ScheduleStaffRowViewModel): ShiftCounts {
  return row.cells.reduce(
    (counts, cell) => {
      if (cell.shift === "早") counts.early++;
      else if (cell.shift === "日") counts.day++;
      else if (cell.shift === "遅") counts.late++;
      else if (cell.shift === "夜") counts.night++;
      else if (cell.shift === "明") counts.afterNight++;
      else if (cell.shift === "公") counts.off++;
      else if (cell.shift === "休" || cell.shift === "有" || cell.shift === "特" || cell.shift === "欠") counts.leave++;
      else if (!cell.shift) counts.blank++;
      return counts;
    },
    { early: 0, day: 0, late: 0, night: 0, afterNight: 0, off: 0, leave: 0, blank: 0 },
  );
}

function renderRowSummary(row: ScheduleStaffRowViewModel): string {
  const counts = countRowShifts(row);
  return [
    renderSummaryCell(counts.early),
    renderSummaryCell(counts.day),
    renderSummaryCell(counts.late),
    renderSummaryCell(counts.night),
    renderSummaryCell(counts.afterNight),
    renderSummaryCell(counts.off),
    renderSummaryCell(counts.leave),
    renderSummaryCell(counts.blank),
  ].join("");
}

function renderSummaryCell(value: number): string {
  return `<td class="summary-cell">${value || ""}</td>`;
}

interface DailyCoverage {
  early: number;
  day: number;
  late: number;
  night: number;
  shortages: string[];
}

function buildDailyCoverage(viewModel: AppViewModel): DailyCoverage[] {
  return viewModel.schedule.days.map((_, dayIndex) => {
    const counts = viewModel.schedule.rows.reduce(
      (daily, row) => {
        const shift = row.cells[dayIndex]?.shift || "";
        if (shift === "早") daily.early++;
        if (shift === "日") daily.day++;
        if (shift === "遅") daily.late++;
        if (shift === "夜") daily.night++;
        return daily;
      },
      { early: 0, day: 0, late: 0, night: 0, shortages: [] as string[] },
    );
    if (counts.early < viewModel.settings.requirements.early) counts.shortages.push("早");
    if (counts.day < viewModel.settings.requirements.day) counts.shortages.push("日");
    if (counts.late < viewModel.settings.requirements.late) counts.shortages.push("遅");
    if (counts.night < viewModel.settings.requirements.night) counts.shortages.push("夜");
    return counts;
  });
}

function renderCoverageRows(viewModel: AppViewModel, coverage: DailyCoverage[]): string {
  const rows = [
    renderCoverageRow("早", "early", viewModel.settings.requirements.early, coverage),
    renderCoverageRow("日", "day", viewModel.settings.requirements.day, coverage),
    renderCoverageRow("遅", "late", viewModel.settings.requirements.late, coverage),
    renderCoverageRow("夜", "night", viewModel.settings.requirements.night, coverage),
  ];
  const shortageLine = coverage
    .map((day, index) => ({ day: index + 1, shortages: day.shortages }))
    .filter((item) => item.shortages.length)
    .map((item) => `${item.day}日 ${item.shortages.join("/")}`)
    .join("、");
  rows.push(
    [
      '<tr class="coverage-row shortage-row">',
      '<th class="sticky role-col" scope="row">不足</th>',
      `<th class="sticky name-col" scope="row">${escapeHtml(shortageLine || "なし")}</th>`,
      coverage
        .map((day) => `<td class="${day.shortages.length ? "coverage-short" : "coverage-ok"}">${escapeHtml(day.shortages.join(""))}</td>`)
        .join(""),
      '<td class="summary-cell" colspan="8"></td>',
      "</tr>",
    ].join(""),
  );
  return rows.join("");
}

function renderCoverageRow(label: string, key: "early" | "day" | "late" | "night", required: number, coverage: DailyCoverage[]): string {
  return [
    '<tr class="coverage-row">',
    `<th class="sticky role-col" scope="row">必要${escapeHtml(label)}</th>`,
    `<th class="sticky name-col" scope="row">${required}/日</th>`,
    coverage
      .map((day) => {
        const value = day[key];
        const tone = value < required ? "coverage-short" : "coverage-ok";
        return `<td class="${tone}">${value}</td>`;
      })
      .join(""),
    '<td class="summary-cell" colspan="8"></td>',
    "</tr>",
  ].join("");
}

function renderScheduleCell(cell: ScheduleCellViewModel): string {
  const titleParts = [cell.date, cell.requestLabel, cell.note].filter(Boolean);
  const title = titleParts.length ? ` title="${escapeHtml(titleParts.join(" / "))}"` : "";
  const request = cell.requestLabel ? ` data-request="${escapeHtml(cell.requestLabel)}"` : "";
  return `<td class="shift shift-${cell.tone}" data-date="${escapeHtml(cell.date)}"${request}${title}>${escapeHtml(cell.shift || "")}</td>`;
}

function renderCss(): string {
  return `
:root {
  color-scheme: light;
  --bg: #f4f6f8;
  --surface: #ffffff;
  --surface-soft: #f9fafb;
  --line: #d7dce2;
  --line-strong: #aeb8c2;
  --text: #17202a;
  --muted: #5e6a75;
  --accent: #245a7a;
  --accent-soft: #e5f0f6;
  --ready: #1d6f42;
  --note: #8a5b12;
  --warning: #9a4d13;
  --blocked: #a93535;
  --work: #f8fbff;
  --night: #e9efff;
  --after-night: #eef2f5;
  --off: #f3f0ea;
  --leave: #edf7ee;
  --exclusion: #f0f0f0;
  --matched: #e8f6ef;
  --unmet: #fdebec;
}

* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 14px;
}
.app-shell {
  min-height: 100vh;
  padding: 16px;
}
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
  margin-bottom: 12px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 8px;
}
h1, h2, h3, p { margin: 0; }
h1 { font-size: 22px; font-weight: 700; }
h2 { font-size: 16px; margin-bottom: 8px; }
h3 { font-size: 14px; margin-bottom: 8px; }
.title-group { display: grid; gap: 6px; }
.status { color: var(--muted); font-weight: 700; }
.status-ready { color: var(--ready); }
.status-warning { color: var(--warning); }
.status-blocked { color: var(--blocked); }
.action-bar { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 12px;
  align-items: start;
}
.primary-column {
  min-width: 0;
  display: grid;
  gap: 12px;
}
.side-rail {
  min-width: 0;
  display: grid;
  gap: 12px;
  position: sticky;
  top: 12px;
}
.action {
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  font-weight: 700;
}
.action-solve {
  background: var(--accent);
  border-color: var(--accent);
  color: #ffffff;
}
.action-exportExcel,
.action-exportPdf {
  background: var(--accent-soft);
  border-color: #bdd3df;
  color: #153f57;
}
.action:disabled { color: #9aa3ad; background: #eef1f4; }
.action:not(:disabled) { cursor: pointer; }
.operation-panel,
.workflow-panel,
.diagnostics {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 12px;
}
.operation-panel {
  display: grid;
  gap: 12px;
}
.workflow-list {
  display: grid;
  gap: 8px;
}
.operation-status {
  margin: 0 0 10px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}
.workflow-step {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr);
  gap: 2px 8px;
  align-items: center;
  padding: 8px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #fbfcfd;
}
.workflow-step span {
  grid-row: span 2;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #e7edf2;
  color: #41505c;
  font-size: 12px;
  font-weight: 800;
}
.workflow-step strong {
  line-height: 1.2;
}
.workflow-step small {
  color: var(--muted);
  line-height: 1.35;
}
.workflow-ready {
  border-color: #a8cfb4;
  background: #f5fbf7;
}
.workflow-ready span {
  background: #dcefe3;
  color: #1d6f42;
}
.workflow-blocked {
  border-color: #dfa1a1;
  background: #fff6f6;
}
.workflow-blocked span {
  background: #f8d8d8;
  color: var(--blocked);
}
.workflow-pending {
  opacity: 0.82;
}
.operation-group {
  display: grid;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--line);
}
.operation-group:first-child {
  padding-top: 0;
  border-top: 0;
}
.button-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.button-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}
.diagnostic-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}
.diagnostic-section {
  border: 1px solid var(--line);
  border-left-width: 4px;
  border-radius: 6px;
  padding: 10px;
}
.diagnostic-note { border-left-color: var(--note); }
.diagnostic-warning { border-left-color: var(--warning); }
.diagnostic-blocked, .diagnostic-error { border-left-color: var(--blocked); }
.diagnostic-list { display: grid; gap: 8px; }
.diagnostic-item {
  display: grid;
  gap: 3px;
  line-height: 1.45;
}
.diagnostic-item span { color: var(--muted); }
.monthly-overview {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;
}
.overview-metric {
  min-height: 58px;
  display: grid;
  align-content: center;
  gap: 4px;
  padding: 10px 12px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.overview-metric span {
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}
.overview-metric strong {
  font-size: 16px;
  line-height: 1.2;
}
.overview-ready { border-color: #9ec5ad; background: #f3faf6; }
.overview-blocked { border-color: #dfa1a1; background: #fff5f5; }
.schedule-section {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 12px;
}
.section-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.section-heading.compact {
  margin-bottom: 6px;
}
.section-heading span {
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}
.data-workspace {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 12px;
}
.tab-input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.tab-list {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 10px;
  border-bottom: 1px solid var(--line);
}
.tab-button {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  padding: 0 12px;
  border: 1px solid transparent;
  border-bottom: 0;
  border-radius: 6px 6px 0 0;
  color: var(--muted);
  font-weight: 700;
  cursor: pointer;
}
.tab-panel { display: none; }
#tab-settings:checked ~ .tab-list label[for="tab-settings"],
#tab-staff:checked ~ .tab-list label[for="tab-staff"],
#tab-requests:checked ~ .tab-list label[for="tab-requests"],
#tab-schedule:checked ~ .tab-list label[for="tab-schedule"],
#tab-actual:checked ~ .tab-list label[for="tab-actual"],
#tab-history:checked ~ .tab-list label[for="tab-history"],
#tab-capacity:checked ~ .tab-list label[for="tab-capacity"],
#tab-solver:checked ~ .tab-list label[for="tab-solver"],
#tab-json:checked ~ .tab-list label[for="tab-json"] {
  background: var(--surface-soft);
  border-color: var(--line);
  color: var(--text);
}
#tab-settings:checked ~ .tab-panels .panel-settings,
#tab-staff:checked ~ .tab-panels .panel-staff,
#tab-requests:checked ~ .tab-panels .panel-requests,
#tab-schedule:checked ~ .tab-panels .panel-schedule,
#tab-actual:checked ~ .tab-panels .panel-actual,
#tab-history:checked ~ .tab-panels .panel-history,
#tab-capacity:checked ~ .tab-panels .panel-capacity,
#tab-solver:checked ~ .tab-panels .panel-solver,
#tab-json:checked ~ .tab-panels .panel-json {
  display: block;
}
.settings-editor,
.tsv-editor,
.document-editor {
  background: transparent;
  border: 0;
  padding: 0;
}
.data-preview {
  display: grid;
  gap: 8px;
  margin-bottom: 12px;
}
.preview-wrap {
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: 6px;
  max-height: 260px;
}
.compact-table {
  max-height: 220px;
}
.preview-table {
  width: 100%;
  min-width: 720px;
  border-collapse: separate;
  border-spacing: 0;
}
.preview-table th,
.preview-table td {
  min-width: auto;
  height: 30px;
  padding: 5px 8px;
  text-align: left;
  vertical-align: middle;
}
.preview-table thead th {
  top: 0;
  background: #edf2f5;
}
.preview-table tbody tr:nth-child(even) td {
  background: #fbfcfd;
}
.weekday-list {
  color: var(--muted);
  font-size: 12px;
}
.shift-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 22px;
  margin: 1px 3px 1px 0;
  padding: 0 6px;
  border: 1px solid #c9d4dc;
  border-radius: 999px;
  background: #f8fbff;
  font-size: 12px;
  font-weight: 700;
}
.request-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.request-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 26px;
  padding: 0 8px;
  border: 1px solid #cbd8c9;
  border-radius: 999px;
  background: #f5faf5;
  color: #284d33;
  font-size: 12px;
  font-weight: 700;
}
.request-hard {
  border-color: #d7b267;
  background: #fff8e7;
  color: #694b10;
}
.request-work {
  border-color: #9fc3d5;
  background: #eef7fb;
  color: #234f64;
}
.request-exclusion {
  border-color: #c5cbd1;
  background: #f5f6f7;
  color: #3f4850;
}
.request-urgent {
  border-color: #dfaaaa;
  background: #fff3f3;
  color: #8b3434;
}
.request-pill strong {
  font-variant-numeric: tabular-nums;
}
.request-legend {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 10px;
  color: var(--muted);
  font-size: 12px;
}
.request-legend span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.request-legend strong {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  flex: 0 0 auto;
}
.legend-hard { background: #d7b267; }
.legend-work { background: #9fc3d5; }
.legend-exclusion { background: #aeb7bf; }
.legend-urgent { background: #dfaaaa; }
.request-type {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 7px;
  border: 1px solid transparent;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}
.settings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(92px, 1fr));
  gap: 8px;
}
.recovery-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
  margin-bottom: 8px;
}
.leave-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 8px;
}
.leave-grid .wide {
  grid-column: 1 / -1;
}
.recovery-grid label,
.leave-grid label {
  display: grid;
  gap: 4px;
  color: var(--muted);
  font-weight: 700;
}
.recovery-grid input,
.leave-grid input,
.leave-grid select {
  min-height: 34px;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 4px 8px;
  font: inherit;
}
.leave-form {
  margin-bottom: 10px;
}
.settings-grid label {
  display: grid;
  gap: 4px;
  color: var(--muted);
  font-weight: 700;
}
.settings-grid input {
  min-height: 34px;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 4px 8px;
  font: inherit;
}
.tsv-editor textarea {
  width: 100%;
  min-height: 120px;
  max-height: 34vh;
  resize: vertical;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 8px;
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.45;
  white-space: pre;
}
.document-editor textarea {
  width: 100%;
  min-height: 160px;
  max-height: 34vh;
  resize: vertical;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 8px;
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.45;
}
.schedule-wrap {
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: 6px;
  max-height: calc(100vh - 170px);
}
.schedule-table {
  border-collapse: separate;
  border-spacing: 0;
  min-width: max-content;
  width: 100%;
}
th, td {
  border-right: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  min-width: 36px;
  height: 32px;
  padding: 4px 6px;
  text-align: center;
  white-space: nowrap;
}
thead th {
  position: sticky;
  top: 0;
  z-index: 3;
  background: #eaf0f4;
  font-weight: 700;
}
thead tr:nth-child(2) th { top: 32px; }
.sticky {
  position: sticky;
  z-index: 4;
  background: #fbfcfd;
}
.role-col {
  left: 0;
  min-width: 112px;
  text-align: left;
}
.name-col {
  left: 112px;
  min-width: 96px;
  text-align: left;
}
thead .sticky { z-index: 5; background: #e7edf2; }
.weekday { color: var(--muted); font-size: 12px; }
.weekend { background: #f3eee8; }
.shift-work { background: var(--work); }
.shift-night { background: var(--night); font-weight: 700; }
.shift-afterNight { background: var(--after-night); }
.shift-off { background: var(--off); color: #6f5c3f; }
.shift-leave { background: var(--leave); color: #23633c; }
.shift-supplyExclusion { background: var(--exclusion); color: #49515a; }
.shift-requestMatched { background: var(--matched); box-shadow: inset 0 0 0 2px #4d9a68; }
.shift-requestUnmet { background: var(--unmet); color: var(--blocked); font-weight: 700; box-shadow: inset 0 0 0 2px #cf6060; }
.shift-empty { background: #ffffff; color: #bdc4cb; }
.summary-head,
.summary-cell {
  min-width: 42px;
  background: #f4f7f9;
  color: #394550;
  font-weight: 700;
}
.summary-cell {
  font-variant-numeric: tabular-nums;
}
.coverage-row th,
.coverage-row td {
  height: 26px;
  font-size: 12px;
  font-weight: 700;
}
.coverage-row .sticky {
  background: #eef3f6;
}
.coverage-ok {
  background: #f2f8f4;
  color: #1d6f42;
}
.coverage-short {
  background: #fdebec;
  color: var(--blocked);
}
.shortage-row .name-col {
  max-width: 96px;
  overflow: hidden;
  text-overflow: ellipsis;
}
@media (max-width: 720px) {
  .app-shell { padding: 10px; }
  .top-bar { align-items: flex-start; flex-direction: column; }
  .action-bar { justify-content: flex-start; }
  .workspace { grid-template-columns: 1fr; }
  .side-rail { position: static; }
  .monthly-overview { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .request-legend { grid-template-columns: 1fr; }
  .section-heading { align-items: flex-start; flex-direction: column; }
  .button-grid { grid-template-columns: 1fr; }
  .role-col { min-width: 92px; }
  .name-col { left: 92px; min-width: 82px; }
}
`.trim();
}

function renderClientScript(actionBasePath: string): string {
  return `<script>
(() => {
  const actionBasePath = "${escapeScriptString(actionBasePath)}";
  const actions = {
    validate: actionBasePath + "/validate",
    monthlyPrecheck: actionBasePath + "/monthly-precheck",
    runMonthlyTransition: actionBasePath + "/monthly-transition",
    archiveCurrentMonth: actionBasePath + "/monthly-archive",
    startNextMonthPlanning: actionBasePath + "/start-next-month-planning",
    promoteOperationMonth: actionBasePath + "/promote-operation-month",
    repairCalendar: actionBasePath + "/repair-calendar",
    checkSolverConnection: actionBasePath + "/check-solver-connection",
    postEditRecheck: actionBasePath + "/post-edit-recheck",
    solve: actionBasePath + "/solve",
    createActual: actionBasePath + "/create-actual",
    addLeaveRequest: actionBasePath + "/add-leave-request",
    cancelPlannedLeave: actionBasePath + "/cancel-planned-leave",
    cancelUrgentLeave: actionBasePath + "/cancel-urgent-leave",
    recover: actionBasePath + "/recover",
    save: actionBasePath + "/save",
    load: actionBasePath + "/load",
    backup: actionBasePath + "/backup",
    applySettings: actionBasePath + "/import/settings",
    applyStaffTsv: actionBasePath + "/import/staff-tsv",
    exportStaffTsv: actionBasePath + "/export/staff-tsv",
    applyRequestsTsv: actionBasePath + "/import/requests-tsv",
    exportRequestsTsv: actionBasePath + "/export/requests-tsv",
    applyScheduleTsv: actionBasePath + "/import/schedule-tsv",
    exportScheduleTsv: actionBasePath + "/export/schedule-tsv",
    applyActualScheduleTsv: actionBasePath + "/import/actual-schedule-tsv",
    exportActualScheduleTsv: actionBasePath + "/export/actual-schedule-tsv",
    ensureHistory: actionBasePath + "/ensure-history",
    exportChangeHistoryTsv: actionBasePath + "/export/change-history-tsv",
    exportUrgentLeaveHistoryTsv: actionBasePath + "/export/urgent-leave-history-tsv",
    exportAiDebugJson: actionBasePath + "/export/ai-debug-json",
    runCapacitySimulation: actionBasePath + "/run-capacity-simulation",
    refreshCapacitySimulation: actionBasePath + "/refresh-capacity-simulation",
    importCapacitySimulationJson: actionBasePath + "/import/capacity-simulation-json",
    exportCapacitySimulationJson: actionBasePath + "/export/capacity-simulation-json",
    importSolverOutputJson: actionBasePath + "/import/solver-output-json",
    exportSolverInputJson: actionBasePath + "/export/solver-input-json",
    applyJson: actionBasePath + "/import/json",
    exportJson: actionBasePath + "/export/json",
    exportExcel: actionBasePath + "/export/excel",
    exportPdf: actionBasePath + "/export/pdf",
    quit: actionBasePath + "/quit"
  };

  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.getAttribute("data-action");
    const endpoint = actions[action];
    if (!endpoint) return;
    if (action === "exportExcel" || action === "exportPdf" || action === "exportJson" || action === "exportScheduleTsv" || action === "exportStaffTsv" || action === "exportRequestsTsv" || action === "exportActualScheduleTsv" || action === "exportChangeHistoryTsv" || action === "exportUrgentLeaveHistoryTsv" || action === "exportAiDebugJson" || action === "exportCapacitySimulationJson" || action === "exportSolverInputJson") {
      window.location.href = endpoint;
      return;
    }
    const body = action === "applyJson"
      ? { documentText: document.querySelector("#document-json")?.value || "" }
      : action === "recover"
        ? {
            urgentLeaveText: document.querySelector("#urgent-leave-tsv")?.value || "",
            fixedThroughDate: document.querySelector("#recovery-fixed-through-date")?.value || ""
          }
      : action === "addLeaveRequest"
        ? collectLeaveRequest()
      : action === "cancelPlannedLeave"
        ? { index: document.querySelector("#cancel-planned-leave-index")?.value || "" }
      : action === "cancelUrgentLeave"
        ? { index: document.querySelector("#cancel-urgent-leave-index")?.value || "" }
      : action === "applySettings"
        ? collectSettings()
        : action === "applyStaffTsv"
          ? { staffText: document.querySelector("#staff-tsv")?.value || "" }
        : action === "applyRequestsTsv"
          ? { requestsText: document.querySelector("#requests-tsv")?.value || "" }
        : action === "applyScheduleTsv"
          ? { scheduleText: document.querySelector("#schedule-tsv")?.value || "" }
      : action === "applyActualScheduleTsv"
        ? { actualScheduleText: document.querySelector("#actual-schedule-tsv")?.value || "" }
      : action === "importCapacitySimulationJson"
        ? { capacitySimulationText: document.querySelector("#capacity-simulation-json")?.value || "" }
      : action === "importSolverOutputJson"
        ? { solverOutputText: document.querySelector("#solver-output-json")?.value || "" }
        : undefined;
    await runAction(endpoint, body);
  });

  function collectSettings() {
    const out = { requirements: {} };
    document.querySelectorAll("[data-settings-field]").forEach((input) => {
      const field = input.getAttribute("data-settings-field");
      const value = Number(input.value);
      if (field === "year") out.year = value;
      if (field === "month") out.month = value;
      if (field === "requirements.early") out.requirements.early = value;
      if (field === "requirements.day") out.requirements.day = value;
      if (field === "requirements.late") out.requirements.late = value;
      if (field === "requirements.night") out.requirements.night = value;
    });
    return out;
  }

  function collectLeaveRequest() {
    return {
      staffName: document.querySelector("#leave-staff-name")?.value || "",
      type: document.querySelector("#leave-type")?.value || "",
      startDate: document.querySelector("#leave-start-date")?.value || "",
      endDate: document.querySelector("#leave-end-date")?.value || "",
      notes: document.querySelector("#leave-notes")?.value || ""
    };
  }

  async function runAction(endpoint, body) {
    setBusy(true);
    let replaced = false;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined
      });
      const html = await response.text();
      if (!response.ok) throw new Error(html || "request failed");
      const next = new DOMParser().parseFromString(html, "text/html").querySelector(".app-shell");
      const shell = document.querySelector(".app-shell");
      if (next && shell) shell.replaceWith(next);
      replaced = Boolean(next && shell);
    } catch (error) {
      const status = document.querySelector(".status");
      if (status) {
        status.textContent = "画面更新に失敗しました";
        status.className = "status status-blocked";
      }
    } finally {
      if (!replaced) setBusy(false);
    }
  }

  function setBusy(busy) {
    document.querySelectorAll("[data-action]").forEach((button) => {
      button.disabled = busy || button.hasAttribute("data-original-disabled");
    });
  }

  document.querySelectorAll("[data-action]:disabled").forEach((button) => {
    button.setAttribute("data-original-disabled", "true");
  });
})();
</script>`;
}

function escapeScriptString(value: string): string {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
