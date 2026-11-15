"""Stage 7: season timing per fire year (onset, peak, end) and its trend."""
from __future__ import annotations

import argparse

import numpy as np
import pandas as pd

from lib.io import DATA, load_config, read_json, region_ids, write_json
from lib.season import day_of_fire_year, fire_year, season_marks
from lib.stats import mann_kendall, theil_sen

MARKS = ["onset", "peak", "end"]
COMPARABLE_DAYS = 7


def marks_by_year(daily: pd.DataFrame, sat: str, start_month: int, min_total: float) -> dict[int, dict]:
    """Season marks for every fire year this satellite observed from first day to last."""
    d = daily[daily["sat"] == sat].copy()
    if d.empty:
        return {}
    d["fy"] = fire_year(d["date_local"], start_month)
    d["doy"] = day_of_fire_year(d["date_local"], start_month)
    out = {}
    for fy, g in d.groupby("fy"):
        length = (pd.Timestamp(fy + 1, start_month, 1) - pd.Timestamp(fy, start_month, 1)).days
        if len(g) != length:
            continue
        m = season_marks(g.sort_values("doy")["fire_days"].to_numpy(float))
        if m and m["total"] >= min_total:
            out[int(fy)] = m
    return out


def clock_region(cfg: dict, region_id: str) -> None:
    clim = read_json(DATA / "agg" / region_id / "climate.json")
    start = clim["fireYearStartMonth"]
    daily = pd.read_parquet(DATA / "agg" / region_id / "daily.parquet")
    hm = pd.read_parquet(DATA / "harmonized" / region_id / "monthly.parquet")
    hm["fy"] = fire_year(pd.to_datetime(hm["ym"] + "-01"), start)
    totals = hm.groupby("fy")["harmonized"].sum()
    min_total = cfg["min_fire_days_for_clock"]
    by_sat = {s: marks_by_year(daily, s, start, min_total) for s in ["aqua", "snpp", "noaa20"]}

    # Each era uses its own satellite: S-NPP where it saw the whole fire year, Aqua before it, NOAA-20 after it.
    first_snpp = min(by_sat["snpp"]) if by_sat["snpp"] else 9999
    years = []
    for fy in sorted(set().union(*by_sat.values())):
        if fy in by_sat["snpp"]:
            sat = "snpp"
        elif fy < first_snpp and fy in by_sat["aqua"]:
            sat = "aqua"
        elif fy > first_snpp and fy in by_sat["noaa20"]:
            sat = "noaa20"
        else:
            continue
        m = by_sat[sat][fy]
        years.append({"fireYear": fy, "onset": m["onset"], "peak": m["peak"], "end": m["end"],
                      "total": float(totals.get(fy, np.nan)), "sat": sat})

    both = sorted(set(by_sat["aqua"]) & set(by_sat["snpp"]))
    y0, y1 = cfg["calibration_years"]
    both = [fy for fy in both if y0 <= fy <= y1]
    overlap = {"years": both, "meanAbsDiffDays": None}
    if both:
        diffs = {k: float(np.mean([abs(by_sat["aqua"][fy][k] - by_sat["snpp"][fy][k]) for fy in both])) for k in MARKS}
        overlap.update({"meanAbsDiffDays": float(np.mean(list(diffs.values()))), **{f"{k}Days": v for k, v in diffs.items()}})

    def trends(rows: list[dict]) -> dict:
        x = np.array([y["fireYear"] for y in rows], float)
        out = {}
        for k in MARKS + ["length"]:
            v = np.array([y["end"] - y["onset"] if k == "length" else y[k] for y in rows], float)
            if len(v) >= 8:
                slope, lo, hi = theil_sen(x, v)
                out[k] = {"daysPerDecade": slope * 10, "lo": lo * 10, "hi": hi * 10, "p": mann_kendall(v)}
            else:
                out[k] = None
        return out

    trend = trends(years)
    # A mark the two satellites place more than a week apart in the same years cannot carry a cross-satellite trend.
    for k in MARKS:
        if trend[k] and overlap["meanAbsDiffDays"] is not None:
            trend[k]["comparable"] = bool(overlap[f"{k}Days"] <= COMPARABLE_DAYS)
    if trend["length"] and trend["onset"] and trend["end"]:
        trend["length"]["comparable"] = bool(trend["onset"].get("comparable", True) and trend["end"].get("comparable", True))
    # Control: the same marks from Aqua alone, one instrument for every year.
    aqua_only = trends([{"fireYear": fy, **m} for fy, m in sorted(by_sat["aqua"].items())])
    out = {"fireYearStartMonth": start, "years": years, "trend": trend, "trendAquaOnly": aqua_only, "overlapCheck": overlap}
    write_json(DATA / "clock" / f"{region_id}.json", out)
    t = trend["peak"]
    print(f"[clock] {region_id}: {len(years)} fire years; overlap check {overlap['meanAbsDiffDays']} days; "
          f"peak trend {t and round(t['daysPerDecade'], 1)} d/decade (p={t and round(t['p'], 2)})", flush=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--region")
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()
    cfg = load_config()
    for rid in region_ids(cfg, args.region, args.all, "harmonized/{region}/monthly.parquet"):
        clock_region(cfg, rid)


if __name__ == "__main__":
    main()
