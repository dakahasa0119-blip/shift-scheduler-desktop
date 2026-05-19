import type { MonthlyScheduleDocument, ScheduleRow, ShiftCode } from "./domain";
import { renderRequestsTsv, renderStaffTsv } from "./inputTsv";
import { renderActualScheduleTsv, renderChangeHistoryTsv, renderUrgentLeaveHistoryTsv } from "./operationalRecords";
import { renderScheduleTsv } from "./scheduleTsv";

export interface AiDebugBundle {
  schemaVersion: "desktop-shift-scheduler-ai-debug/v1";
  generatedAt: string;
  source: "desktop-linux";
  target: {
    year: number;
    month: number;
    daysInMonth: number;
  };
  counts: {
    staff: number;
    requests: number;
    scheduleRows: number;
    actualRows: number;
    changeHistory: number;
    urgentLeaveHistory: number;
    capacitySimulationResults: number;
  };
  requirements: MonthlyScheduleDocument["requirements"];
  diagnostics: MonthlyScheduleDocument["diagnostics"];
  scheduleSummary: ReturnType<typeof summarizeScheduleRows>;
  actualScheduleSummary: ReturnType<typeof summarizeScheduleRows>;
  requestsByType: Record<string, number>;
  tsv: {
    staff: string;
    requests: string;
    schedule: string;
    actualSchedule: string;
    changeHistory: string;
    urgentLeaveHistory: string;
  };
  document: MonthlyScheduleDocument;
}

export function buildAiDebugBundle(document: MonthlyScheduleDocument, now: Date = new Date()): AiDebugBundle {
  return {
    schemaVersion: "desktop-shift-scheduler-ai-debug/v1",
    generatedAt: now.toISOString(),
    source: "desktop-linux",
    target: {
      year: document.year,
      month: document.month,
      daysInMonth: daysInMonth(document.year, document.month),
    },
    counts: {
      staff: document.staff.length,
      requests: document.requests.length,
      scheduleRows: document.schedule.length,
      actualRows: document.actualSchedule?.length || 0,
      changeHistory: document.changeHistory?.length || 0,
      urgentLeaveHistory: document.urgentLeaveHistory?.length || 0,
      capacitySimulationResults: document.capacitySimulation?.results.length || 0,
    },
    requirements: document.requirements,
    diagnostics: document.diagnostics,
    scheduleSummary: summarizeScheduleRows(document.schedule),
    actualScheduleSummary: summarizeScheduleRows(document.actualSchedule || []),
    requestsByType: countRequestsByType(document),
    tsv: {
      staff: renderStaffTsv(document),
      requests: renderRequestsTsv(document),
      schedule: renderScheduleTsv(document),
      actualSchedule: renderActualScheduleTsv(document),
      changeHistory: renderChangeHistoryTsv(document),
      urgentLeaveHistory: renderUrgentLeaveHistoryTsv(document),
    },
    document,
  };
}

export function renderAiDebugBundleJson(document: MonthlyScheduleDocument, now: Date = new Date()): string {
  return `${JSON.stringify(buildAiDebugBundle(document, now), null, 2)}\n`;
}

function summarizeScheduleRows(rows: ScheduleRow[]): Record<Exclude<ShiftCode, ""> | "blank", number> {
  const counts = {
    "早": 0,
    "日": 0,
    "遅": 0,
    "夜": 0,
    "明": 0,
    "公": 0,
    "休": 0,
    "有": 0,
    "特": 0,
    "欠": 0,
    "出張": 0,
    "産休": 0,
    "育休": 0,
    blank: 0,
  };
  rows.forEach((row) => {
    row.shifts.forEach((shift) => {
      if (shift) counts[shift]++;
      else counts.blank++;
    });
  });
  return counts;
}

function countRequestsByType(document: MonthlyScheduleDocument): Record<string, number> {
  return document.requests.reduce<Record<string, number>>((acc, request) => {
    acc[request.type] = (acc[request.type] || 0) + 1;
    return acc;
  }, {});
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}
