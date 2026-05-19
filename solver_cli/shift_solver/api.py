import os
from typing import Any, Dict

from fastapi import FastAPI, Header, HTTPException

from .model import solve_shift_schedule


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
    output, debug = solve_shift_schedule(payload, time_limit_seconds=time_limit)
    output["apiDiagnostics"] = debug
    return output

