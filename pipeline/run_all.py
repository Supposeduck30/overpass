"""Run the pipeline stages in order.

python run_all.py --region cordoba
python run_all.py --all --from-stage calibrate
"""
from __future__ import annotations

import argparse
import subprocess
import sys

from lib.io import PIPELINE

STAGES = ["fetch", "clean", "grid", "aggregate", "calibrate", "validate", "clock", "nowcast", "forecast", "export"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--region")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--from-stage", choices=STAGES, default="fetch")
    ap.add_argument("--to-stage", choices=STAGES, default="export")
    args = ap.parse_args()
    target = ["--all"] if args.all else ["--region", args.region or ""]
    for stage in STAGES[STAGES.index(args.from_stage):STAGES.index(args.to_stage) + 1]:
        print(f"=== {stage} ===", flush=True)
        done = subprocess.run([sys.executable, str(PIPELINE / f"{stage}.py"), *target], cwd=PIPELINE)
        if done.returncode != 0:
            sys.exit(f"Stage {stage} failed")


if __name__ == "__main__":
    main()
