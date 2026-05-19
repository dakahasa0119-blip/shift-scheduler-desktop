import type { MonthlyScheduleDocument } from "./domain";
import { buildSolverInputPayload } from "./solverInput";
import { applySolverOutputToDocument, type SolverOutputPayload } from "./solverOutput";
import { runPostEditRecheck } from "./postEditRecheck";

export function renderSolverInputJson(document: MonthlyScheduleDocument, now: Date = new Date()): string {
  return `${JSON.stringify(buildSolverInputPayload(document, now.toISOString()), null, 2)}\n`;
}

export function importSolverOutputJson(document: MonthlyScheduleDocument, text: string): MonthlyScheduleDocument {
  const payload = JSON.parse(text) as SolverOutputPayload | { ok?: boolean; result?: SolverOutputPayload };
  const output = "result" in payload && payload.result ? payload.result : payload as SolverOutputPayload;
  const next = applySolverOutputToDocument(document, output);
  return runPostEditRecheck(next);
}
