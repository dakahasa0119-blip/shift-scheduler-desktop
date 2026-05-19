# Solver Adapter Design

## Purpose

The desktop app should not store or edit data in the solver's input shape directly.

The solver adapter converts:

```text
desktop MonthlyScheduleDocument
  -> gas-shift-solver-input/v1 compatible payload
```

This keeps UI, storage, and exports independent from solver implementation details.

## Current Adapter

Source:

- `desktop/core/solverInput.ts`

Primary function:

```ts
buildSolverInputPayload(document, generatedAt)
```

Reverse adapter:

```ts
applySolverOutputToDocument(document, output)
```

Source:

- `desktop/core/solverOutput.ts`

## Mapping

### Staff

`MonthlyScheduleDocument.staff[]` becomes `staffConditions[]`.

| Desktop | Solver |
|---|---|
| `role` | `staffType` |
| `name` | `name` |
| `allowedShifts` | `allowedShift` |
| `allowedWeekdays` | `sunday` to `saturday` |
| `fixedOffWeekday` | `fixedOff` |
| `gender` | `gender` |
| `monthlyNightTarget` | `condition` as `月N回` |
| `notes` | appended to `condition` |

### Requests

`requests[]` becomes `leaveEntries[]`.

Date ranges are expanded into one entry per date inside the target month.

### Supply Exclusions

Request types below are copied to `supplyExclusions[]`.

- `出張`
- `産休`
- `育休`
- `休職`
- `長期病欠`
- `入職前`
- `退職後`

### Requirements

`requirements` becomes:

- `requiredShiftStaffing`
- `allowedShortagePolicy`
- `femaleRequiredWeekdays`

### Previous Month Tail

`previousMonthTail` is keyed by `staffId` in the desktop model.

The solver payload converts it to staff name keys because the current solver input uses names.

## Important Rules

- Preferred work requests are not hard stops.
- Leave requests are hard by default.
- Supply exclusions should render human-readable reason labels.
- Generic `除` is an internal marker and should not be used as human-facing output.
- The adapter should be the only place that knows the current solver payload shape.
- Solver result diagnostics should be converted into desktop `ScheduleDiagnostics`.
- User-facing messages should be generated from desktop diagnostics, not from raw solver text.

## Output Mapping

### Schedule

`schedule[]` from solver output becomes desktop `schedule[]`.

Staff matching uses name for now because the current solver payload is name-based.

If the solver returns a row that does not match a known staff member, the desktop row gets an internal id in the form:

```text
unmatched:<name>
```

### Readiness

Solver `deploymentReadiness` becomes desktop diagnostic summary.

| Solver | Desktop |
|---|---|
| `hardViolationCount` | `requiredFixCount` |
| `toleratedShortageCount` | `allowedShortageCount` |
| `blockingShortageCount` | `blockingShortageCount` |
| `unmetLeaveRequestCount` | `unmetLeaveRequestCount` |
| `unmetShiftRequestCount` | `unmetShiftRequestCount` |

### Shortages

`operationalShortageReasons[]` becomes `shortages[]`.

Shortage reasons are localized before display.

### Requests

`requestDiagnostics.unmetRequests[]` becomes `unmetRequests[]`.

- Requested work shifts are non-blocking.
- Leave requests are blocking.

### Suggestions

`manualCorrectionHints[]` becomes `suggestions[]`.

The desktop UI should show these as optional next actions, not as low-level solver diagnostics.

## Next Work

- Add a local API endpoint that calls both adapters.
- Add runtime validation for `MonthlyScheduleDocument`.
- Add a small fixture-based adapter test once a desktop test runner exists.
- Decide whether to keep calling the existing solver directly or copy solver runtime under `desktop/solver`.
