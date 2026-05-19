import argparse
import json
from pathlib import Path

from .model import solve_shift_schedule


def main():
    parser = argparse.ArgumentParser(prog="shift_solver")
    sub = parser.add_subparsers(dest="command", required=True)

    solve = sub.add_parser("solve")
    solve.add_argument("input_json")
    solve.add_argument("--out", required=True)
    solve.add_argument("--debug", default="")
    solve.add_argument("--time-limit", type=float, default=120.0)

    args = parser.parse_args()
    if args.command == "solve":
        source = json.loads(Path(args.input_json).read_text(encoding="utf-8"))
        output, debug = solve_shift_schedule(source, time_limit_seconds=args.time_limit)
        Path(args.out).write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
        if args.debug:
            Path(args.debug).write_text(json.dumps(debug, ensure_ascii=False, indent=2), encoding="utf-8")

