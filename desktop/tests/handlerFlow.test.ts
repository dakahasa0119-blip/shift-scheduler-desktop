import { handleHealth, handleRecoverSchedule, handleSolveSchedule, handleValidateSchedule } from "../api/handlers";
import { MockSolverRunner } from "../api/mockSolverRunner";
import { sampleMonthlyScheduleDocument } from "../core/fixtures";

async function main(): Promise<void> {
  const health = handleHealth({ appVersion: "0.1.0-test" });
  assertEqual(health.ok, true, "health ok");
  assertEqual(health.status, "ready", "health status");

  const validation = handleValidateSchedule({ document: sampleMonthlyScheduleDocument });
  assertEqual(validation.ok, true, "validation response ok");
  if (!validation.ok) return;
  assertEqual(validation.validation.ok, true, "document validation ok");

  const solver = new MockSolverRunner();
  const response = await handleSolveSchedule(
    {
      document: sampleMonthlyScheduleDocument,
      options: {
        timeLimitSeconds: 3,
        mode: "create",
      },
    },
    {
      appVersion: "0.1.0-test",
      now: () => new Date(2026, 4, 19, 20, 0, 0),
      solver,
    },
  );

  assertEqual(response.ok, true, "solve response ok");
  if (!response.ok) return;

  assertEqual(solver.calls.length, 1, "solver call count");
  assertEqual(solver.calls[0].options.timeLimitSeconds, 10, "normalized time limit");
  assertEqual(solver.calls[0].input.generatedAt, "2026-05-19 20:00:00", "generatedAt");
  assertEqual(response.diagnostics.summary.canUse, true, "can use solved schedule");
  assertEqual(response.diagnostics.summary.allowedShortageCount, 1, "allowed shortage count");
  assertEqual(response.diagnostics.summary.unmetShiftRequestCount, 1, "unmet shift request count");
  assertTrue(response.messages.includes("結果: 作成できました（確認事項あり）"), "result message");
  assertTrue(response.messages.some((line) => line.includes("不足: 6/3 遅 1名（許容内）")), "shortage message");
  assertTrue(
    response.messages.some((line) => line.includes("勤務希望: 6/6 有山 希望日勤 → 早（未充足）")),
    "unmet request message",
  );

  const recovery = await handleRecoverSchedule(
    {
      document: sampleMonthlyScheduleDocument,
      urgentLeaves: [{ staffId: "staff_eto", date: "2026-06-05", reason: "急休", notes: "発熱" }],
      options: { fixedThroughDate: "2026-06-04", timeLimitSeconds: 3 },
    },
    {
      appVersion: "0.1.0-test",
      now: () => new Date(2026, 4, 19, 20, 0, 0),
      solver,
    },
  );
  assertEqual(recovery.ok, true, "recovery response ok");
  if (!recovery.ok) return;
  assertEqual(solver.calls.length, 2, "recovery solver call count");
  assertEqual(solver.calls[1].options.mode, "recovery", "recovery solver mode");
  assertEqual(solver.calls[1].input.recovery?.urgentLeaves[0].originalShift, "早", "recovery original shift");
}

main().catch((error) => {
  console.error(error);
  throw error;
});

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertTrue(value: boolean, label: string): void {
  if (!value) {
    throw new Error(`${label}: expected true`);
  }
}
