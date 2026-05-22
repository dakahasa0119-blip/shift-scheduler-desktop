import type { MonthlyScheduleDocument } from "./domain";
import type { SolverOutputPayload } from "./solverOutput";

export function createBlankMonthlyScheduleDocument(date: Date = new Date()): MonthlyScheduleDocument {
  const target = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return {
    schemaVersion: "desktop-shift-schedule/v1",
    year: target.getFullYear(),
    month: target.getMonth() + 1,
    staff: [],
    requests: [],
    requirements: {
      early: 1,
      day: 0,
      late: 1,
      night: 1,
      allowedShortageShifts: ["遅"],
      femaleRequiredWeekdays: [],
    },
    previousMonthTail: {},
    schedule: [],
    diagnostics: null,
  };
}

export const sampleMonthlyScheduleDocument: MonthlyScheduleDocument = {
  schemaVersion: "desktop-shift-schedule/v1",
  year: 2026,
  month: 6,
  staff: [
    {
      id: "staff_eto",
      name: "江藤",
      role: "介護リーダー",
      gender: "男性",
      employmentType: "常勤",
      allowedShifts: ["早", "日", "遅", "夜"],
      allowedWeekdays: [0, 1, 2, 3, 4, 5, 6],
      fixedOffWeekday: null,
      monthlyNightTarget: 3,
      monthlyNightMin: 3,
      monthlyNightMax: 3,
      monthlyWorkLimitDays: 21,
      publicHolidayTargetDays: 9,
      weeklyWorkLimitDays: 5,
      weeklyNightLimit: 3,
      activeFrom: null,
      activeTo: null,
      notes: "",
    },
    {
      id: "staff_ariyama",
      name: "有山",
      role: "介護",
      gender: "男性",
      employmentType: "常勤",
      allowedShifts: ["早", "日", "遅", "夜"],
      allowedWeekdays: [0, 1, 2, 3, 4, 5, 6],
      fixedOffWeekday: null,
      monthlyNightTarget: 2,
      monthlyNightMin: 2,
      monthlyNightMax: 2,
      monthlyWorkLimitDays: 21,
      publicHolidayTargetDays: 9,
      weeklyWorkLimitDays: 5,
      weeklyNightLimit: 3,
      activeFrom: null,
      activeTo: null,
      notes: "",
    },
  ],
  requests: [
    {
      id: "req_eto_0606",
      staffId: "staff_eto",
      type: "事前希望休",
      startDate: "2026-06-06",
      endDate: "2026-06-06",
      notes: "",
    },
    {
      id: "req_ariyama_0606",
      staffId: "staff_ariyama",
      type: "希望日勤",
      startDate: "2026-06-06",
      endDate: "2026-06-06",
      notes: "",
    },
  ],
  requirements: {
    early: 1,
    day: 1,
    late: 1,
    night: 1,
    allowedShortageShifts: ["遅"],
    femaleRequiredWeekdays: [],
  },
  previousMonthTail: {
    staff_eto: ["遅", "夜", "明", "公", "夜", "明", "早"],
  },
  schedule: [
    {
      staffId: "staff_eto",
      role: "介護リーダー",
      name: "江藤",
      shifts: ["早", "夜", "明", "公", "早", "公"],
    },
    {
      staffId: "staff_ariyama",
      role: "介護",
      name: "有山",
      shifts: ["日", "日", "遅", "公", "日", "早"],
    },
  ],
  diagnostics: null,
};

export const sampleSolverOutputWithAdvisory: SolverOutputPayload = {
  schemaVersion: "gas-shift-solver-output/v1",
  targetYear: 2026,
  targetMonth: 6,
  daysInMonth: 30,
  status: "OPTIMAL",
  schedule: [
    {
      role: "介護リーダー",
      name: "江藤",
      shifts: ["早", "夜", "明", "公", "早", "公"],
    },
    {
      role: "介護",
      name: "有山",
      shifts: ["日", "日", "遅", "公", "日", "早"],
    },
  ],
  diagnostics: {
    deploymentReadiness: {
      isProductionSafe: true,
      hardViolationCount: 0,
      shortageCount: 1,
      toleratedShortageCount: 1,
      blockingShortageCount: 0,
      unmetLeaveRequestCount: 0,
      unmetShiftRequestCount: 1,
      operationalShortageReasons: [
        {
          date: "6/3",
          shift: "遅",
          topBlockedReasons: ["月間上限x3", "週次上限x3", "当日他シフトx3"],
        },
      ],
      blockers: [],
      advisories: ["allowed_shortage", "unmet_shift_request"],
    },
    requestDiagnostics: {
      unmetRequests: [
        {
          date: "6/6",
          name: "有山",
          type: "希望日勤",
          assignedShift: "早",
        },
      ],
    },
    manualCorrectionHints: [
      {
        issueType: "shortage",
        priority: "高",
        date: "6/3",
        shift: "遅",
        suggestedAction: "前後日の勤務を再配分",
        redistributionCandidatesText: "槇(早: 当日他シフト・翌日早出)",
      },
    ],
    veteranEvaluation: {
      schemaVersion: "veteran-evaluation/v1",
      modelVersion: "veteran-rule-model/20260521_features_v5_combined",
      decision: "staffing_limited_accept",
      action: "preserve_as_staffing_pressure",
      score: 1240,
      reason: "通常人員制約由来の崩れとして扱う",
    },
    candidateSelection: {
      schemaVersion: "veteran-candidate-selection/v1",
      candidateCount: 2,
      selectedIndex: 1,
      selectedProfile: "no_four_work",
      candidates: [
        {
          index: 0,
          profile: "standard",
          status: "OPTIMAL",
          veteranDecision: "needs_solver_improvement",
          veteranAction: "increase_targeted_penalty",
          veteranScore: 2500,
          reason: "4連勤が残る",
        },
        {
          index: 1,
          profile: "no_four_work",
          status: "OPTIMAL",
          veteranDecision: "staffing_limited_accept",
          veteranAction: "preserve_as_staffing_pressure",
          veteranScore: 1240,
          reason: "通常人員制約由来の崩れとして扱う",
        },
      ],
    },
  },
};
