import type { AppActionViewModel, AppViewModel } from "./appViewModel";
import type { DiagnosticItemViewModel, DiagnosticSectionViewModel } from "./diagnosticViewModel";
import type { ScheduleCellViewModel } from "./scheduleTableViewModel";

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
    renderDiagnostics(viewModel),
    renderSettingsEditor(viewModel),
    renderScheduleTsvEditor(viewModel),
    renderDocumentEditor(viewModel),
    renderSchedule(viewModel),
    "</main>",
    options.interactive ? renderClientScript(options.actionBasePath || "/preview") : "",
    "</body>",
    "</html>",
  ].join("\n");
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

function renderTopBar(viewModel: AppViewModel): string {
  return [
    '<header class="top-bar">',
    '<div class="title-group">',
    `<h1>${escapeHtml(viewModel.title)}</h1>`,
    `<p class="status status-${viewModel.status.tone}">${escapeHtml(viewModel.status.label)}</p>`,
    "</div>",
    '<nav class="action-bar" aria-label="操作">',
    viewModel.actions.map(renderActionButton).join(""),
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
  return [
    '<section class="schedule-section" aria-label="勤務表">',
    `<h2>${escapeHtml(viewModel.schedule.title)}</h2>`,
    '<div class="schedule-wrap">',
    '<table class="schedule-table">',
    "<thead>",
    "<tr>",
    '<th class="sticky role-col" scope="col">職種</th>',
    '<th class="sticky name-col" scope="col">氏名</th>',
    viewModel.schedule.days.map((day) => `<th class="${day.weekend ? "weekend" : ""}" scope="col">${day.day}</th>`).join(""),
    "</tr>",
    "<tr>",
    '<th class="sticky role-col subhead" scope="col"></th>',
    '<th class="sticky name-col subhead" scope="col"></th>',
    viewModel.schedule.days
      .map((day) => `<th class="weekday ${day.weekend ? "weekend" : ""}" scope="col">${escapeHtml(day.weekday)}</th>`)
      .join(""),
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
          "</tr>",
        ].join(""),
      )
      .join(""),
    "</tbody>",
    "</table>",
    "</div>",
    "</section>",
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
  --bg: #f6f7f9;
  --surface: #ffffff;
  --line: #d7dce2;
  --text: #17202a;
  --muted: #5e6a75;
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
.app-shell { padding: 18px; }
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
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
.action {
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  font-weight: 700;
}
.action:disabled { color: #9aa3ad; background: #eef1f4; }
.action:not(:disabled) { cursor: pointer; }
.diagnostics {
  margin-bottom: 14px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 12px;
}
.diagnostic-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
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
.schedule-section {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 12px;
}
.settings-editor,
.tsv-editor,
.document-editor {
  margin-bottom: 14px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 12px;
}
.settings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(92px, 1fr));
  gap: 8px;
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
  max-height: 30vh;
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
  max-height: 70vh;
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
  background: #eef3f7;
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
@media (max-width: 720px) {
  .app-shell { padding: 10px; }
  .top-bar { align-items: flex-start; flex-direction: column; }
  .action-bar { justify-content: flex-start; }
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
    solve: actionBasePath + "/solve",
    save: actionBasePath + "/save",
    load: actionBasePath + "/load",
    backup: actionBasePath + "/backup",
    applySettings: actionBasePath + "/import/settings",
    applyScheduleTsv: actionBasePath + "/import/schedule-tsv",
    exportScheduleTsv: actionBasePath + "/export/schedule-tsv",
    applyJson: actionBasePath + "/import/json",
    exportJson: actionBasePath + "/export/json",
    exportExcel: actionBasePath + "/export/excel",
    exportPdf: actionBasePath + "/export/pdf"
  };

  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.getAttribute("data-action");
    const endpoint = actions[action];
    if (!endpoint) return;
    if (action === "exportExcel" || action === "exportPdf" || action === "exportJson" || action === "exportScheduleTsv") {
      window.location.href = endpoint;
      return;
    }
    const body = action === "applyJson"
      ? { documentText: document.querySelector("#document-json")?.value || "" }
      : action === "applySettings"
        ? collectSettings()
        : action === "applyScheduleTsv"
          ? { scheduleText: document.querySelector("#schedule-tsv")?.value || "" }
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
