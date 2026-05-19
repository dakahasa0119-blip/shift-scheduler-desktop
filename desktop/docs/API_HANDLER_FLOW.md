# API Handler Flow

## Purpose

The handler layer defines the application flow before choosing the concrete local server runtime.

This keeps the future Tauri/Windows packaging independent from whether the API is hosted by FastAPI, Node, or another embedded runtime.

## Current Source

- `desktop/api/handlers.ts`

## Flow

```text
UI request
  -> API handler
  -> validateMonthlyScheduleDocument
  -> buildSolverInputPayload
  -> SolverRunner.solve
  -> applySolverOutputToDocument
  -> return MonthlyScheduleDocument + user-facing messages
```

## SolverRunner Boundary

`SolverRunner` is intentionally an interface.

Possible future implementations:

- Run bundled Python solver as a child process.
- Call an embedded local HTTP solver.
- Call a development-only remote solver.

The UI and API contracts should not change when this implementation changes.

The default packaging direction is bundled solver executable.

See:

- `SOLVER_BUNDLING.md`
- `../solver/bundledSolverTypes.ts`

## Error Handling

The API returns two messages:

- `message`: technical/support message
- `userMessage`: short user-facing message

The UI should show `userMessage` first.

Technical details should go to logs.

## Current Endpoints Covered

- `GET /health`
- `POST /schedule/validate`
- `POST /schedule/solve`

## Not Implemented Yet

- `POST /schedule/recover`
- `POST /export/excel`
- Actual HTTP server
- Solver child-process runner
- App-managed port selection
