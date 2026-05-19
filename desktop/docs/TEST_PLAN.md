# Desktop Test Plan

## Scope

Desktop tests should validate the migration code without touching the GAS production version.

## Initial Test Targets

### Core

- Data model validation
- Diagnostic message formatting
- Desktop model to solver input conversion
- Solver output to desktop model conversion

### API Handler

- `handleHealth` returns ready status
- `handleValidateSchedule` returns validation issues without throwing
- `handleSolveSchedule` rejects invalid input before solver call
- `handleSolveSchedule` calls `SolverRunner` with normalized time limit
- `handleSolveSchedule` returns user-facing messages from converted diagnostics

Current smoke test:

- `desktop/tests/handlerFlow.test.ts`
- `desktop/tests/bundledSolverRunner.test.ts`
- `desktop/tests/bundledSolverManifest.test.ts`
- `desktop/tests/solverBuildPlan.test.ts`
- `desktop/tests/linuxBundledSolverSmoke.test.ts`

## First Fixture

Use a small in-memory fixture based on:

- `desktop/samples/monthly_schedule_2026_06.sample.md`

The first runnable test should avoid `.json` fixture files until clasp exclusion is adjusted.

## Test Runner Direction

Candidate:

```text
tsx or ts-node for early prototype
vitest once the app package is created
```

Do not add test scripts to the root GAS `package.json` until the desktop package is separated.

Temporary command:

```text
npx -y -p tsx tsx desktop/tests/handlerFlow.test.ts
npx -y -p tsx tsx desktop/tests/bundledSolverRunner.test.ts
npx -y -p tsx tsx desktop/tests/bundledSolverManifest.test.ts
npx -y -p tsx tsx desktop/tests/solverBuildPlan.test.ts
npx -y -p tsx tsx desktop/tests/linuxBundledSolverSmoke.test.ts
```

The Linux bundled solver smoke test skips itself if the local Linux solver artifact has not been built.

## Guardrails

- Tests must live under `desktop/`.
- Tests must not import GAS files.
- Tests must not require Google Sheets.
- Tests must not call Cloud Run by default.
