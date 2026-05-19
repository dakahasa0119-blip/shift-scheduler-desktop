import type { ExportCell, ExportCellTone, ExportWorkbook } from "./exportWorkbook";

export function renderWorkbookAsPrintHtml(workbook: ExportWorkbook): string {
  const sheet = workbook.sheets[0];
  const columnCount = Math.max(...sheet.rows.map((row) => row.cells.length));
  return [
    "<!doctype html>",
    '<html lang="ja">',
    "<head>",
    '<meta charset="utf-8">',
    `<title>${escapeHtml(workbook.fileBaseName)}</title>`,
    "<style>",
    printCss(),
    "</style>",
    "</head>",
    "<body>",
    `<main class="print-sheet print-${sheet.print.orientation}">`,
    `<table aria-label="${escapeHtml(sheet.name)}">`,
    renderColGroup(columnCount),
    "<tbody>",
    sheet.rows.map((row) => `<tr class="row-${row.kind}">${renderRowCells(row, columnCount)}</tr>`).join(""),
    "</tbody>",
    "</table>",
    "</main>",
    "</body>",
    "</html>",
  ].join("\n");
}

function renderColGroup(columnCount: number): string {
  return [
    "<colgroup>",
    '<col class="col-role">',
    '<col class="col-name">',
    ...Array.from({ length: Math.max(0, columnCount - 2) }).map(() => '<col class="col-day">'),
    "</colgroup>",
  ].join("");
}

function renderRowCells(row: { kind: string; cells: ExportCell[] }, columnCount: number): string {
  if (row.kind === "title") {
    const title = row.cells[0] || { value: "" };
    const status = row.cells[1] || { value: "" };
    return [
      renderCell(title, Math.max(1, columnCount - 8)),
      renderCell(status, 8),
    ].join("");
  }
  if (row.kind === "diagnostic") {
    if (row.cells.length <= 1) return renderCell(row.cells[0] || { value: "" }, columnCount);
    return [
      renderCell(row.cells[0], 7),
      renderCell(row.cells[1], Math.max(1, columnCount - 7)),
    ].join("");
  }
  if (row.kind === "spacer") return renderCell(row.cells[0] || { value: "" }, columnCount);
  return row.cells.map((cell) => renderCell(cell)).join("");
}

function renderCell(cell: ExportCell, colSpan = 1): string {
  const className = ["cell", `tone-${cell.tone || "plain"}`, cell.role ? `role-${cell.role}` : ""]
    .filter(Boolean)
    .join(" ");
  const note = cell.note ? ` title="${escapeHtml(cell.note)}"` : "";
  const span = colSpan > 1 ? ` colspan="${colSpan}"` : "";
  return `<td class="${className}"${span}${note}>${escapeHtml(cell.value)}</td>`;
}

function printCss(): string {
  return `
@page {
  size: A4 landscape;
  margin: 8mm;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  color: #17202a;
  background: #ffffff;
  font-family: "Yu Gothic", "Meiryo", system-ui, sans-serif;
  font-size: 9px;
}
.print-sheet {
  width: 100%;
}
table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}
.col-role { width: 42px; }
.col-name { width: 54px; }
td {
  border: 1px solid #bfc7d1;
  padding: 2px 3px;
  text-align: center;
  vertical-align: middle;
  overflow-wrap: anywhere;
  line-height: 1.25;
}
.row-title td {
  font-weight: 700;
  font-size: 13px;
  text-align: left;
  background: #eef3f7;
  height: 24px;
}
.row-header td,
.row-weekday td {
  font-weight: 700;
  background: #eef3f7;
}
.role-label {
  text-align: left;
  font-weight: 700;
}
.role-title {
  font-weight: 700;
}
.role-note {
  text-align: left;
}
.role-shift {
  font-weight: 700;
}
.row-diagnostic td {
  text-align: left;
  font-size: 9px;
  line-height: 1.35;
}
.row-spacer td {
  height: 6px;
  padding: 0;
  border-left: 0;
  border-right: 0;
  background: #ffffff;
}
.tone-work { background: #f8fbff; }
.tone-night { background: #e9efff; }
.tone-afterNight { background: #eef2f5; }
.tone-off { background: #f3f0ea; }
.tone-leave { background: #edf7ee; }
.tone-supplyExclusion { background: #f0f0f0; }
.tone-requestMatched { background: #e8f6ef; }
.tone-requestUnmet,
.tone-blocked { background: #fdebec; color: #a93535; }
.tone-diagnostic { background: #fffaf0; }
.tone-warning { background: #fff4df; }
`.trim();
}

function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
