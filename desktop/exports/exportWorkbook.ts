import type { AppViewModel } from "../app/appViewModel";
import type { DiagnosticSectionViewModel } from "../app/diagnosticViewModel";
import type { ScheduleCellTone } from "../app/scheduleTableViewModel";

export interface ExportWorkbook {
  fileBaseName: string;
  sheets: ExportSheet[];
}

export interface ExportSheet {
  name: string;
  rows: ExportRow[];
  frozenColumns: number;
  frozenRows: number;
  print: ExportPrintSettings;
}

export interface ExportRow {
  cells: ExportCell[];
  kind: "title" | "header" | "weekday" | "schedule" | "spacer" | "diagnostic";
}

export interface ExportCell {
  value: string;
  role?: "title" | "header" | "label" | "shift" | "note";
  tone?: ExportCellTone;
  note?: string;
}

export type ExportCellTone =
  | "plain"
  | "work"
  | "night"
  | "afterNight"
  | "off"
  | "leave"
  | "supplyExclusion"
  | "requestMatched"
  | "requestUnmet"
  | "diagnostic"
  | "warning"
  | "blocked";

export interface ExportPrintSettings {
  orientation: "landscape" | "portrait";
  fitToWidth: number;
  repeatHeaderRows: number;
}

export function buildExportWorkbook(viewModel: AppViewModel): ExportWorkbook {
  return {
    fileBaseName: viewModel.schedule.title.replace(/\s+/g, "_"),
    sheets: [
      {
        name: "勤務表",
        rows: [
          buildTitleRow(viewModel),
          buildDayHeaderRow(viewModel),
          buildWeekdayHeaderRow(viewModel),
          ...buildScheduleRows(viewModel),
          buildSpacerRow(),
          ...buildDiagnosticRows(viewModel.diagnostics?.sections || []),
        ],
        frozenColumns: 2,
        frozenRows: 3,
        print: {
          orientation: "landscape",
          fitToWidth: 1,
          repeatHeaderRows: 3,
        },
      },
    ],
  };
}

export function renderWorkbookAsTsv(workbook: ExportWorkbook): string {
  const sheet = workbook.sheets[0];
  return sheet.rows.map((row) => row.cells.map((cell) => escapeTsv(cell.value)).join("\t")).join("\n");
}

function buildTitleRow(viewModel: AppViewModel): ExportRow {
  return {
    kind: "title",
    cells: [
      {
        value: viewModel.schedule.title,
        role: "title",
        tone: "plain",
      },
      {
        value: viewModel.status.label,
        role: "note",
        tone: viewModel.status.tone === "blocked" ? "blocked" : "diagnostic",
      },
    ],
  };
}

function buildDayHeaderRow(viewModel: AppViewModel): ExportRow {
  return {
    kind: "header",
    cells: [
      { value: "職種", role: "header", tone: "plain" },
      { value: "氏名", role: "header", tone: "plain" },
      ...viewModel.schedule.days.map((day) => ({
        value: String(day.day),
        role: "header" as const,
        tone: day.weekend ? ("off" as const) : ("plain" as const),
      })),
    ],
  };
}

function buildWeekdayHeaderRow(viewModel: AppViewModel): ExportRow {
  return {
    kind: "weekday",
    cells: [
      { value: "", role: "header", tone: "plain" },
      { value: "", role: "header", tone: "plain" },
      ...viewModel.schedule.days.map((day) => ({
        value: day.weekday,
        role: "header" as const,
        tone: day.weekend ? ("off" as const) : ("plain" as const),
      })),
    ],
  };
}

function buildScheduleRows(viewModel: AppViewModel): ExportRow[] {
  return viewModel.schedule.rows.map((row) => ({
    kind: "schedule",
    cells: [
      { value: row.role, role: "label", tone: "plain" },
      { value: row.name, role: "label", tone: "plain" },
      ...row.cells.map((cell) => ({
        value: cell.shift,
        role: "shift" as const,
        tone: exportToneFromScheduleTone(cell.tone),
        note: [cell.requestLabel, cell.note].filter(Boolean).join(" / "),
      })),
    ],
  }));
}

function buildDiagnosticRows(sections: DiagnosticSectionViewModel[]): ExportRow[] {
  const rows: ExportRow[] = [];
  sections.forEach((section) => {
    rows.push({
      kind: "diagnostic",
      cells: [
        {
          value: section.title,
          role: "header",
          tone: diagnosticTone(section.severity),
        },
      ],
    });
    section.items.forEach((item) => {
      rows.push({
        kind: "diagnostic",
        cells: [
          {
            value: item.primary,
            role: "label",
            tone: diagnosticTone(item.severity),
          },
          {
            value: item.secondary,
            role: "note",
            tone: diagnosticTone(item.severity),
          },
        ],
      });
    });
  });
  return rows;
}

function buildSpacerRow(): ExportRow {
  return {
    kind: "spacer",
    cells: [{ value: "", tone: "plain" }],
  };
}

function exportToneFromScheduleTone(tone: ScheduleCellTone): ExportCellTone {
  const map: Record<ScheduleCellTone, ExportCellTone> = {
    empty: "plain",
    work: "work",
    night: "night",
    afterNight: "afterNight",
    off: "off",
    leave: "leave",
    supplyExclusion: "supplyExclusion",
    requestMatched: "requestMatched",
    requestUnmet: "requestUnmet",
  };
  return map[tone];
}

function diagnosticTone(severity: string): ExportCellTone {
  if (severity === "blocked") return "blocked";
  if (severity === "warning") return "warning";
  return "diagnostic";
}

function escapeTsv(value: string): string {
  const text = String(value || "");
  if (!/[\t\r\n"]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}
