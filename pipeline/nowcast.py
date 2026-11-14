"""Stage 8: daily harmonized series -> month-to-date and season-to-date comparisons."""
from __future__ import annotations

import argparse
import datetime as dt

import numpy as np
import pandas as pd

from lib.io import DATA, load_config, read_json, region_ids, write_json
from lib.season import day_of_fire_year, fire_year

SOURCE_SAT = {"aqua-translated": "aqua", "snpp": "snpp", "noaa20-translated": "noaa20"}
NRT_SOURCE = {"aqua": "MODIS_NRT", "snpp": "VIIRS_SNPP_NRT", "noaa20": "VIIRS_NOAA20_NRT"}
ENVELOPE = {"p10": 0.10, "p25": 0.25, "p50": 0.50, "p75": 0.75, "p90": 0.90}


def daily_harmonized(region_id: str) -> pd.DataFrame:
    """Each month's harmonized total spread over its days in proportion to the source satellite's daily counts."""
    hm = pd.read_parquet(DATA / "harmonized" / region_id / "monthly.parquet")
    daily = pd.read_parquet(DATA / "agg" / region_id / "daily.parquet")
    daily["ym"] = daily["date_local"].dt.strftime("%Y-%m")
    parts = []
    for r in hm.itertuples():
        d = daily[(daily["sat"] == SOURCE_SAT[r.source]) & (daily["ym"] == r.ym)].sort_values("date_local")
        src = d["fire_days"].to_numpy(float)
        # A month the source saw as empty can still carry a small translated value; spread it evenly.
        share = src / src.sum() if src.sum() > 0 else np.full(len(src), 1.0 / max(len(src), 1))
        parts.append(pd.DataFrame({"date": d["date_local"].to_numpy(), "ym": r.ym, "value": share * r.harmonized,
                                   "source_count": src, "source": r.source, "partial": r.partial}))
    return pd.concat(parts, ignore_index=True)


def nowcast_region(cfg: dict, region_id: str) -> None:
    start = read_json(DATA / "agg" / region_id / "climate.json")["fireYearStartMonth"]
    dh = daily_harmonized(region_id)
    dh["year"] = dh["date"].dt.year
    dh["month"] = dh["date"].dt.month

    by_month: dict[str, dict[str, list[float]]] = {}
    for (month, year), g in dh.groupby(["month", "year"]):
        if g["partial"].iloc[0] and g["date"].min().day != 1:
            continue  # a month that starts late (July 2002) has no days-1..d to compare
        by_month.setdefault(str(month), {})[str(year)] = [round(float(v), 2) for v in g["value"].cumsum()]
    write_json(DATA / "nowcast" / region_id / "mtd.json", {"byMonth": by_month}, compact=True)

    dh["fy"] = fire_year(dh["date"], start)
    dh["doy"] = day_of_fire_year(dh["date"], start)
    years, complete = {}, []
    for fy, g in dh.groupby("fy"):
        g = g.sort_values("doy")
        if g["doy"].iloc[0] != 1:
            continue
        cum = g["value"].cumsum().to_numpy()
        years[str(int(fy))] = [round(float(v), 2) for v in cum]
        length = (pd.Timestamp(fy + 1, start, 1) - pd.Timestamp(fy, start, 1)).days
        if len(cum) == length:
            complete.append(cum[:365])
    stack = np.vstack(complete)
    envelope = {k: [round(float(v), 2) for v in np.quantile(stack, q, axis=0)] for k, q in ENVELOPE.items()}
    write_json(DATA / "nowcast" / region_id / "season.json",
               {"fireYearStartMonth": start, "years": years, "envelope": envelope, "completeYears": len(complete)}, compact=True)

    last = dh.iloc[-1]
    cur = dh[dh["ym"] == last["ym"]]
    sat = SOURCE_SAT[last["source"]]
    write_json(DATA / "nowcast" / region_id / "current.json", {
        "asOf": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "ym": last["ym"], "day": int(last["date"].day),
        "fireDaysToDate": int(cur["source_count"].sum()), "harmonizedToDate": round(float(cur["value"].sum()), 2),
        "source": NRT_SOURCE[sat], "cached": True})
    print(f"[nowcast] {region_id}: {len(years)} fire years, {len(complete)} complete; current {last['ym']} day "
          f"{int(last['date'].day)}: {cur['value'].sum():.1f}", flush=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--region")
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()
    cfg = load_config()
    for rid in region_ids(cfg, args.region, args.all, "harmonized/{region}/monthly.parquet"):
        nowcast_region(cfg, rid)


if __name__ == "__main__":
    main()
