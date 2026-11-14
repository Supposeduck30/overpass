"""Stage 3: clean detections -> fire-days on the 0.25° grid (plus 0.1° and 0.5° for the unit test)."""
from __future__ import annotations

import argparse

import pandas as pd

from lib.gridding import fire_days
from lib.io import DATA, load_config, region_ids

EXTRA_GRIDS = [0.1, 0.5]


def grid_region(cfg: dict, region_id: str) -> None:
    files = sorted((DATA / "clean" / region_id).glob("*.parquet"))
    if not files:
        raise SystemExit(f"No clean data for {region_id}; run clean.py first")
    df = pd.concat([pd.read_parquet(f) for f in files], ignore_index=True)
    out = DATA / "grid" / region_id
    out.mkdir(parents=True, exist_ok=True)
    for g in [cfg["grid_deg"], *EXTRA_GRIDS]:
        fd = fire_days(df, g)
        fd.to_parquet(out / f"firedays_{g}.parquet", index=False)
        print(f"[grid] {region_id} {g}°: {len(fd)} fire-days from {len(df)} detections", flush=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--region")
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()
    cfg = load_config()
    for rid in region_ids(cfg, args.region, args.all, "clean/{region}"):
        grid_region(cfg, rid)


if __name__ == "__main__":
    main()
