# Shift Solver CLI

Linux-side solver entrypoint for GAS shift schedules.

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
