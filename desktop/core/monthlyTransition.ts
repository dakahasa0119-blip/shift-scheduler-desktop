import type { MonthlyArchiveEntry, MonthlyOperationState, MonthlyScheduleDocument, ScheduleRow } from "./domain";
import { appendChangeHistory, createOrRefreshActualSchedule } from "./operationalRecords";

export interface MonthlyTransitionResult {
  document: MonthlyScheduleDocument;
  message: string;
}

export function initializeOperationMonths(document: MonthlyScheduleDocument): MonthlyScheduleDocument {
  const current = formatYearMonth(document.year, document.month);
  const target = nextYearMonth(current);
  return {
    ...document,
    operation: {
      currentOperationYearMonth: document.operation?.currentOperationYearMonth || current,
      currentTargetYearMonth: document.operation?.currentTargetYearMonth || target,
      lastArchivedYearMonth: document.operation?.lastArchivedYearMonth || "",
      archives: document.operation?.archives || [],
    },
  };
}

export function runMonthlyArchive(document: MonthlyScheduleDocument, now: Date = new Date()): MonthlyTransitionResult {
  const initialized = initializeOperationMonths(document);
  const operation = initialized.operation!;
  const yearMonth = operation.currentOperationYearMonth;
  const archive: MonthlyArchiveEntry = {
    yearMonth,
    archivedAt: now.toISOString(),
    schedule: cloneScheduleRows(initialized.schedule),
    actualSchedule: cloneScheduleRows(initialized.actualSchedule || []),
    changeHistory: [...(initialized.changeHistory || [])],
  };
  const archives = [
    ...operation.archives.filter((item) => item.yearMonth !== yearMonth),
    archive,
  ];
  const withArchive = appendChangeHistory({
    ...initialized,
    operation: {
      ...operation,
      lastArchivedYearMonth: yearMonth,
      archives,
    },
  }, {
    category: "月次アーカイブ",
    leaveType: "",
    staffName: "",
    date: yearMonth,
    beforeValue: "",
    afterValue: "保存完了",
    notes: "ローカルアーカイブへ保存",
    executedAt: now.toISOString(),
  });
  return {
    document: withArchive,
    message: `${yearMonth} の勤務表・実績・履歴をアーカイブしました`,
  };
}

export function startNextMonthPlanning(document: MonthlyScheduleDocument, now: Date = new Date()): MonthlyTransitionResult {
  const initialized = initializeOperationMonths(document);
  const operation = initialized.operation!;
  const target = parseYearMonth(operation.currentTargetYearMonth);
  const schedule = initialized.staff.map((staff) => ({
    staffId: staff.id,
    role: staff.role,
    name: staff.name,
    shifts: [],
  }));
  const next = appendChangeHistory({
    ...initialized,
    year: target.year,
    month: target.month,
    schedule,
    actualSchedule: undefined,
    diagnostics: null,
    capacitySimulation: null,
  }, {
    category: "次月勤務表作成",
    leaveType: "",
    staffName: "",
    date: operation.currentTargetYearMonth,
    beforeValue: formatYearMonth(initialized.year, initialized.month),
    afterValue: operation.currentTargetYearMonth,
    notes: "作成対象月へ勤務表を進めました",
    executedAt: now.toISOString(),
  });
  return {
    document: next,
    message: `${operation.currentTargetYearMonth} の勤務表作成準備を行いました`,
  };
}

export function promoteTargetMonthToOperationMonth(document: MonthlyScheduleDocument, now: Date = new Date()): MonthlyTransitionResult {
  const initialized = initializeOperationMonths(document);
  const operation = initialized.operation!;
  const promoted = operation.currentTargetYearMonth;
  const nextTarget = nextYearMonth(promoted);
  let next: MonthlyScheduleDocument = {
    ...initialized,
    operation: {
      ...operation,
      currentOperationYearMonth: promoted,
      currentTargetYearMonth: nextTarget,
    },
  };
  next = createOrRefreshActualSchedule(next, now);
  next = appendChangeHistory(next, {
    category: "運用月更新",
    leaveType: "",
    staffName: "",
    date: promoted,
    beforeValue: operation.currentOperationYearMonth,
    afterValue: promoted,
    notes: `次の作成対象月: ${nextTarget}`,
    executedAt: now.toISOString(),
  });
  return {
    document: next,
    message: `運用月を ${promoted} に進めました`,
  };
}

export function runMonthlyTransition(document: MonthlyScheduleDocument, now: Date = new Date()): MonthlyTransitionResult {
  const archived = runMonthlyArchive(document, now);
  const planned = startNextMonthPlanning(archived.document, now);
  const promoted = promoteTargetMonthToOperationMonth(planned.document, now);
  return {
    document: promoted.document,
    message: `${archived.message} / ${planned.message} / ${promoted.message}`,
  };
}

export function repairCurrentShiftCalendar(document: MonthlyScheduleDocument): MonthlyScheduleDocument {
  const days = daysInMonth(document.year, document.month);
  return {
    ...document,
    schedule: document.staff.map((staff) => {
      const existing = document.schedule.find((row) => row.staffId === staff.id || row.name === staff.name);
      return {
        staffId: staff.id,
        role: staff.role,
        name: staff.name,
        shifts: normalizeShifts(existing?.shifts || [], days),
      };
    }),
    diagnostics: null,
  };
}

export function formatYearMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function nextYearMonth(yearMonth: string): string {
  const { year, month } = parseYearMonth(yearMonth);
  return month === 12 ? formatYearMonth(year + 1, 1) : formatYearMonth(year, month + 1);
}

function parseYearMonth(yearMonth: string): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!match) throw new Error(`年月形式が不正です: ${yearMonth}`);
  return { year: Number(match[1]), month: Number(match[2]) };
}

function cloneScheduleRows(rows: ScheduleRow[]): ScheduleRow[] {
  return rows.map((row) => ({
    ...row,
    shifts: row.shifts.slice(),
  }));
}

function normalizeShifts(values: string[], days: number): MonthlyScheduleDocument["schedule"][number]["shifts"] {
  return Array.from({ length: days }, (_, index) => (values[index] || "") as MonthlyScheduleDocument["schedule"][number]["shifts"][number]);
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}
