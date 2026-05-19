import { BundledSolverRunner } from "../solver/bundledSolverRunner";
import { buildSolverInputPayload } from "../core/solverInput";
import { sampleMonthlyScheduleDocument } from "../core/fixtures";
import {
  NodeSolverFileSystem,
  NodeSolverProcessExecutor,
  NodeSolverTempFileProvider,
} from "../solver/nodeBundledSolverRuntime";

declare const require: (name: string) => any;

const fs = require("node:fs");
const path = require("node:path");

async function main(): Promise<void> {
  const executablePath = path.resolve("desktop/packaging/resources/solver/linux-x64/shift-solver");
  if (!fs.existsSync(executablePath)) {
    console.log("skip: linux bundled solver artifact does not exist");
    return;
  }

  const runner = new BundledSolverRunner({
    config: {
      platform: "linux-x64",
      executablePath,
      workDirectory: "/tmp/shift-desktop-solver-smoke",
      supportLogDirectory: "/tmp/shift-desktop-solver-smoke/logs",
      keepDebugFiles: false,
      defaultTimeLimitSeconds: 10,
    },
    files: new NodeSolverFileSystem(),
    tempFiles: new NodeSolverTempFileProvider(),
    process: new NodeSolverProcessExecutor(),
  });

  const input = buildSolverInputPayload(sampleMonthlyScheduleDocument, "2026-05-19 20:00:00");
  const output = await runner.solve(input, { timeLimitSeconds: 10, mode: "create" });
  assertEqual(output.schemaVersion, "gas-shift-solver-output/v1", "solver output schema");
  assertTrue(Array.isArray(output.schedule), "solver output schedule");
}

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

main().catch((error) => {
  console.error(error);
  throw error;
});
