import os
from typing import Any, Dict

from fastapi import FastAPI, Header, HTTPException

from .model import solve_shift_schedule_candidates


app = FastAPI(title="GAS Shift Solver", version="0.1.0")


def _check_token(authorization: str | None) -> None:
    expected = os.environ.get("SOLVER_API_TOKEN", "").strip()
    if not expected:
        return
    if authorization != f"Bearer {expected}":
        raise HTTPException(status_code=401, detail="invalid solver token")


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/solve")
def solve(payload: Dict[str, Any], authorization: str | None = Header(default=None)) -> Dict[str, Any]:
    _check_token(authorization)
    time_limit = float(payload.get("solverTimeLimitSeconds") or os.environ.get("SOLVER_TIME_LIMIT_SECONDS", 120))
    candidate_count = int(payload.get("candidateCount") or os.environ.get("SOLVER_CANDIDATE_COUNT", 1))
    output, debug = solve_shift_schedule_candidates(payload, time_limit_seconds=time_limit, candidate_count=candidate_count)
    output["apiDiagnostics"] = debug
    return output
