import type { ExportCell, ExportCellTone, ExportWorkbook } from "./exportWorkbook";

export function renderWorkbookAsPrintHtml(workbook: ExportWorkbook): string {
  const sheet = workbook.sheets[0];
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
    "<tbody>",
    sheet.rows.map((row) => `<tr class="row-${row.kind}">${row.cells.map(renderCell).join("")}</tr>`).join(""),
    "</tbody>",
    "</table>",
    "</main>",
    "</body>",
    "</html>",
  ].join("\n");
}

function renderCell(cell: ExportCell): string {
  const className = ["cell", `tone-${cell.tone || "plain"}`, cell.role ? `role-${cell.role}` : ""]
    .filter(Boolean)
    .join(" ");
  const note = cell.note ? ` title="${escapeHtml(cell.note)}"` : "";
  return `<td class="${className}"${note}>${escapeHtml(cell.value)}</td>`;
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
td {
  border: 1px solid #bfc7d1;
  min-height: 18px;
  padding: 2px 3px;
  text-align: center;
  vertical-align: middle;
  overflow-wrap: anywhere;
  line-height: 1.25;
}
.row-title td {
  font-weight: 700;
  font-size: 12px;
  text-align: left;
  background: #eef3f7;
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
