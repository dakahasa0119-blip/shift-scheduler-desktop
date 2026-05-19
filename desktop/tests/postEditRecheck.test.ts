import { sampleMonthlyScheduleDocument } from "../core/fixtures";
import { buildPostEditDiagnostics } from "../core/postEditRecheck";

function main(): void {
  const availableCandidate = buildPostEditDiagnostics({
    ...sampleMonthlyScheduleDocument,
    requirements: {
      ...sampleMonthlyScheduleDocument.requirements,
      early: 1,
      day: 0,
      late: 0,
      night: 0,
      allowedShortageShifts: [],
    },
    requests: [],
    schedule: sampleMonthlyScheduleDocument.schedule.map((row) => ({
      ...row,
      shifts: ["", "", "", "", "", ""],
    })),
  });
  assertTrue(
    availableCandidate.suggestions.some((item) => item.remainingIssueSummary.includes("候補: 江藤")),
    "available candidate suggestion",
  );

  const blockedCandidate = buildPostEditDiagnostics({
    ...sampleMonthlyScheduleDocument,
    requirements: {
      ...sampleMonthlyScheduleDocument.requirements,
      early: 0,
      day: 0,
      late: 0,
      night: 1,
      allowedShortageShifts: [],
    },
    requests: [],
    schedule: sampleMonthlyScheduleDocument.schedule.map((row, index) => ({
      ...row,
      shifts: index === 0 ? ["日"] : ["早"],
    })),
  });
  assertTrue(
    blockedCandidate.suggestions.some((item) => item.remainingIssueSummary.includes("当日日")),
    "blocked candidate reason",
  );
}

function assertTrue(value: boolean, label: string): void {
  if (!value) {
    throw new Error(`${label}: expected true`);
  }
}

main();
