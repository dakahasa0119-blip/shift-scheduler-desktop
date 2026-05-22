# Shift Solver CLI

Linux-side solver entrypoint for GAS shift schedules.

The solver follows the same veteran-quality standard as the GAS side:
`../docs/schedule_quality_standard.md`. Hard constraints must remain blocking;
soft quality work should improve naturalness, fairness, night density, and recovery
stability without making the result harder to explain in the operation log.

The GAS side exports `solver_input_YYYYMM.json` from the current spreadsheet.
This CLI reads that JSON and writes `solver_output_YYYYMM.json`, which GAS can
import from Drive without copying the JSON body by hand.

```bash
cd solver_cli
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python -m shift_solver solve /path/to/solver_input_202606.json --out /path/to/solver_output_202606.json --debug /path/to/solver_debug_202606.json
```

The output JSON shape is intentionally simple:

```json
{
  "schemaVersion": "gas-shift-solver-output/v1",
  "targetYear": 2026,
  "targetMonth": 6,
  "status": "OPTIMAL",
  "schedule": [
    { "role": "介護", "name": "北富", "shifts": ["夜", "明", "公"] }
  ],
  "diagnostics": {}
}
```

## Cloud Run

The same solver is exposed as a FastAPI service for production GAS calls.

```bash
cd solver_cli
gcloud run deploy gas-shift-solver \
  --source . \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --set-env-vars SOLVER_API_TOKEN=change-this-token
```

Set the spreadsheet `設定` sheet:

- `SOLVER_API_URL`: `https://...run.app/solve`
- `SOLVER_API_TOKEN`: the same token used in `SOLVER_API_TOKEN`

Then run:

```text
勤務管理 > 作成・判定 > Solverで勤務表を作成 / 再作成
```

The GAS side rechecks the solver result after applying it. If the recheck finds
blocking issues, it restores the previous schedule grid.

## Quality Gate

Use the regression gate before treating solver quality changes as production-ready:

```bash
npm run solver:quality
npm run solver:quality:compare -- --summary .solver_runs/quality_gate/<run>/summary.json
npm run solver:inspect -- --summary .solver_runs/quality_gate/<run>/summary.json --count 4
```

The normal quality gate uses realistic requests: up to three requested leave days
per person, and night preference is represented by monthly night-count conditions
rather than dated night requests. When current staffing is too tight to judge
schedule naturalness, run the same gate with two BOT care staff first:

```bash
npm run solver:quality:bot2
npm run solver:quality:compare -- --summary .solver_runs/quality_gate_bot2/<run>/summary.json
```

Use BOT results to tune naturalness under adequate headroom, then rerun the normal
`solver:quality` gate to see how the current staffing degrades and whether the
degradation is explained by staffing pressure rather than solver behavior.
For request-cluster and previous-month pressure diagnostics, use
`npm run solver:quality:bot2:stress`; this intentionally includes pathological
stress variants and is not the main naturalness tuning gate.

The gate tracks hard violations, blocking shortages, five-workday runs,
late-to-early edges, dense night blocks, four-workday residuals, urgent-leave
recovery diffs, and absence-candidate diffs. The thresholds live in
`regression_baseline.json`; any relaxation must explain the operational reason.
The inspect step prints sampled real schedules with the staff role label next to
each name, so role-specific expectations can be reviewed instead of judging by
aggregate numbers only.
