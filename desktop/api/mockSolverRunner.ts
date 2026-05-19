import type { SolverRunner, SolverRunOptions } from "./handlers";
import type { SolverInputPayload } from "../core/solverInput";
import type { SolverOutputPayload } from "../core/solverOutput";
import { sampleSolverOutputWithAdvisory } from "../core/fixtures";

export interface MockSolverRunnerCall {
  input: SolverInputPayload;
  options: SolverRunOptions;
}

export class MockSolverRunner implements SolverRunner {
  readonly calls: MockSolverRunnerCall[] = [];

  constructor(private readonly output: SolverOutputPayload = sampleSolverOutputWithAdvisory) {}

  async solve(input: SolverInputPayload, options: SolverRunOptions): Promise<SolverOutputPayload> {
    this.calls.push({ input, options });
    return this.output;
  }
}
