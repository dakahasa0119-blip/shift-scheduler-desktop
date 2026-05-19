import type {
  CapacitySimulationPayload,
  CapacitySimulationPlanSummary,
  CapacitySimulationResult,
  CoreRequiredShiftCode,
  MonthlyScheduleDocument,
  ScheduleRow,
} from "./domain";

const shifts: CoreRequiredShiftCode[] = ["早", "日", "遅", "夜"];
const additionalCounts = [0, 2, 4, 6, 8];

export function runCapacitySimulation(document: MonthlyScheduleDocument, now: Date = new Date()): MonthlyScheduleDocument {
  const payload = buildCapacitySimulationPayload(document, now);
  return {
    ...document,
    capacitySimulation: payload,
  };
}

export function importCapacitySimulationPayload(document: MonthlyScheduleDocument, text: string): MonthlyScheduleDocument {
  const payload = JSON.parse(text) as CapacitySimulationPayload;
  if (payload.schemaVersion !== "capacity-simulation/v1") {
    throw new Error("体制シミュレーションJSONではありません。");
  }
  return {
    ...document,
    capacitySimulation: payload,
  };
}

export function renderCapacitySimulationJson(document: MonthlyScheduleDocument): string {
  return `${JSON.stringify(document.capacitySimulation || buildCapacitySimulationPayload(document), null, 2)}\n`;
}

export function buildCapacitySimulationPayload(document: MonthlyScheduleDocument, now: Date = new Date()): CapacitySimulationPayload {
  const plans = buildPlanDefinitions(document);
  const caseId = `${document.year}-${pad(document.month)}`;
  const results = plans.flatMap((plan) =>
    additionalCounts.map((count) => simulatePlan(document, plan, count, caseId)),
  );
  const planSummaries = plans.map((plan) => summarizePlan(plan, results.filter((item) => item.planId === plan.planId)));
  return {
    schemaVersion: "capacity-simulation/v1",
    generatedAt: now.toISOString(),
    targetYear: document.year,
    targetMonth: document.month,
    caseIds: [caseId],
    additionalCounts,
    planSummaries,
    results,
  };
}

function buildPlanDefinitions(document: MonthlyScheduleDocument): CapacitySimulationPlanSummary[] {
  const current = document.requirements;
  return [
    {
      planId: "current",
      planLabel: "現体制",
      requiredShiftStaffing: normalizeRequired(current),
      minimumAdditionalStaff: null,
      operationalAdditionalStaff: null,
      stableAdditionalStaff: null,
      mainBottlenecks: [],
    },
    {
      planId: "earlyLate2",
      planLabel: "早遅2名体制",
      requiredShiftStaffing: { "早": 2, "日": current.day || 1, "遅": 2, "夜": current.night || 1 },
      minimumAdditionalStaff: null,
      operationalAdditionalStaff: null,
      stableAdditionalStaff: null,
      mainBottlenecks: [],
    },
    {
      planId: "earlyLateNight2",
      planLabel: "早遅夜2名体制",
      requiredShiftStaffing: { "早": 2, "日": current.day || 1, "遅": 2, "夜": 2 },
      minimumAdditionalStaff: null,
      operationalAdditionalStaff: null,
      stableAdditionalStaff: null,
      mainBottlenecks: [],
    },
    {
      planId: "all2",
      planLabel: "全シフト2名体制",
      requiredShiftStaffing: { "早": 2, "日": 2, "遅": 2, "夜": 2 },
      minimumAdditionalStaff: null,
      operationalAdditionalStaff: null,
      stableAdditionalStaff: null,
      mainBottlenecks: [],
    },
  ];
}

function simulatePlan(
  document: MonthlyScheduleDocument,
  plan: CapacitySimulationPlanSummary,
  additionalStaffCount: number,
  caseId: string,
): CapacitySimulationResult {
  const rows = document.actualSchedule?.length ? document.actualSchedule : document.schedule;
  const shortageCount = countShortages(rows, plan.requiredShiftStaffing, document.year, document.month, additionalStaffCount);
  const metrics = buildOperationalRiskMetrics(rows);
  const bottlenecks = buildBottlenecks(shortageCount, metrics);
  return {
    planId: plan.planId,
    planLabel: plan.planLabel,
    caseId,
    additionalStaffCount,
    classification: classify(shortageCount, metrics),
    shortageCount,
    metrics,
    bottlenecks,
  };
}

function summarizePlan(
  plan: CapacitySimulationPlanSummary,
  results: CapacitySimulationResult[],
): CapacitySimulationPlanSummary {
  return {
    planId: plan.planId,
    planLabel: plan.planLabel,
    requiredShiftStaffing: plan.requiredShiftStaffing,
    minimumAdditionalStaff: firstAdditional(results, (item) => item.shortageCount <= 3),
    operationalAdditionalStaff: firstAdditional(results, (item) => item.shortageCount === 0),
    stableAdditionalStaff: firstAdditional(results, (item) => item.shortageCount === 0 && item.metrics.shortNightGap === 0),
    mainBottlenecks: summarizeBottlenecks(results),
  };
}

function countShortages(
  rows: ScheduleRow[],
  required: Record<CoreRequiredShiftCode, number>,
  year: number,
  month: number,
  additionalStaffCount: number,
): number {
  const days = daysInMonth(year, month);
  let shortage = 0;
  for (let dayIndex = 0; dayIndex < days; dayIndex++) {
    shifts.forEach((shift) => {
      const assigned = rows.filter((row) => row.shifts[dayIndex] === shift).length;
      const demand = Math.max(0, required[shift] || 0);
      shortage += Math.max(0, demand - assigned);
    });
  }
  return Math.max(0, shortage - additionalStaffCount * 8);
}

function buildOperationalRiskMetrics(rows: ScheduleRow[]): CapacitySimulationResult["metrics"] {
  return rows.reduce((acc, row) => {
    row.shifts.forEach((shift, index) => {
      const next = row.shifts[index + 1] || "";
      const afterNext = row.shifts[index + 2] || "";
      if ((shift === "公" || shift === "休") && next === "早") acc.postRestEarly++;
      if (shift === "遅" && next === "公") acc.lateToRest++;
      if (shift === "夜" && (next !== "明" || afterNext !== "公")) acc.shortNightGap++;
      if (shift && shift === next && (shift === "早" || shift === "遅" || shift === "夜")) acc.sameShiftRun++;
    });
    return acc;
  }, { postRestEarly: 0, lateToRest: 0, shortNightGap: 0, sameShiftRun: 0 });
}

function buildBottlenecks(shortageCount: number, metrics: CapacitySimulationResult["metrics"]): string[] {
  const items: string[] = [];
  if (shortageCount > 0) items.push("必要人数不足");
  if (metrics.postRestEarly > 0) items.push("公休明け早出");
  if (metrics.lateToRest > 0) items.push("遅出後公休");
  if (metrics.shortNightGap > 0) items.push("夜勤間隔");
  if (metrics.sameShiftRun > 0) items.push("同一勤務連続");
  return items;
}

function classify(
  shortageCount: number,
  metrics: CapacitySimulationResult["metrics"],
): CapacitySimulationResult["classification"] {
  if (shortageCount > 3) return "成立困難";
  if (shortageCount > 0) return "最低成立";
  if (metrics.shortNightGap > 0 || metrics.sameShiftRun > 4) return "運用可能";
  return "安定目安";
}

function firstAdditional(results: CapacitySimulationResult[], predicate: (item: CapacitySimulationResult) => boolean): number | null {
  return results.find(predicate)?.additionalStaffCount ?? null;
}

function summarizeBottlenecks(results: CapacitySimulationResult[]): string[] {
  const counts = new Map<string, number>();
  results.forEach((result) => result.bottlenecks.forEach((item) => counts.set(item, (counts.get(item) || 0) + 1)));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([item]) => item);
}

function normalizeRequired(requirements: MonthlyScheduleDocument["requirements"]): Record<CoreRequiredShiftCode, number> {
  return {
    "早": requirements.early,
    "日": requirements.day,
    "遅": requirements.late,
    "夜": requirements.night,
  };
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
