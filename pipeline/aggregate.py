"""Stage 4: fire-days -> monthly, cell-monthly and daily series, zero-filled over each satellite's era."""
from __future__ import annotations

import argparse

import numpy as np
import pandas as pd

from lib.io import DATA, load_config, region_ids, write_json

# First day each satellite's fire record exists (FIRMS availability table and mission records).
SAT_START = {"terra": "2000-11-01", "aqua": "2002-07-04", "snpp": "2012-01-20"}
SAT_NRT = {"terra": "MODIS_NRT", "aqua": "MODIS_NRT", "snpp": "VIIRS_SNPP_NRT",
           "noaa20": "VIIRS_NOAA20_NRT", "noaa21": "VIIRS_NOAA21_NRT"}
CRITICAL_SHARE = 0.60


def sat_eras(cfg: dict) -> dict[str, tuple[pd.Timestamp, pd.Timestamp]]:
    avail = pd.read_csv(DATA / "raw" / "availability.csv").set_index("data_id")
    start = dict(SAT_START)
    start["noaa20"] = max(str(cfg["link2_start"]), avail.loc["VIIRS_NOAA20_SP", "min_date"])
    start["noaa21"] = f"{pd.Timestamp(avail.loc['VIIRS_NOAA21_NRT', 'max_date']).year}-01-01"
    return {s: (pd.Timestamp(start[s]), pd.Timestamp(avail.loc[SAT_NRT[s], "max_date"])) for s in SAT_NRT}


def climate(monthly: pd.DataFrame) -> dict:
    """Fire-year start and critical months from full S-NPP years (the reference unit)."""
    s = monthly[(monthly["sat"] == "snpp") & monthly["complete"]].copy()
    s["year"] = s["ym"].str[:4].astype(int)
    s["month"] = s["ym"].str[5:].astype(int)
    full = s.groupby("year")["month"].count()
    s = s[s["year"].isin(full[full == 12].index)]
    mean = s.groupby("month")["fire_days"].mean().reindex(range(1, 13), fill_value=0.0)
    start = int(mean.idxmin()) % 12 + 1
    order = mean.sort_values(ascending=False)
    cum = order.cumsum() / max(order.sum(), 1e-9)
    n = int(np.searchsorted(cum.to_numpy(), CRITICAL_SHARE - 1e-9) + 1)
    critical = sorted(order.index[:n].tolist(), key=lambda m: (m - start) % 12)
    return {"fireYearStartMonth": start, "criticalMonths": [int(m) for m in critical],
            "meanByMonth": [float(v) for v in mean.to_numpy()], "years": [int(y) for y in sorted(s["year"].unique())]}


def aggregate_region(cfg: dict, region_id: str) -> None:
    g = cfg["grid_deg"]
    gdir = DATA / "grid" / region_id
    fd = pd.read_parquet(gdir / f"firedays_{g}.parquet")
    fd["ym"] = fd["date_local"].dt.strftime("%Y-%m")
    eras = sat_eras(cfg)

    monthly_rows, daily_rows = [], []
    extra = {name: pd.read_parquet(gdir / f"firedays_{gg}.parquet") for name, gg in (("fd_010", 0.1), ("fd_050", 0.5))}
    for sat, (first, last) in eras.items():
        d = fd[(fd["sat"] == sat) & (fd["date_local"] >= first) & (fd["date_local"] <= last)]
        days = pd.date_range(first, last, freq="D")
        daily = d.groupby("date_local").size().reindex(days, fill_value=0)
        daily_rows.append(pd.DataFrame({"sat": sat, "date_local": days, "fire_days": daily.to_numpy()}))

        cal = pd.DataFrame({"date": days, "ym": days.strftime("%Y-%m")})
        m = cal.groupby("ym").agg(days=("date", "size"), first_day=("date", "min")).reset_index()
        m["days_in_month"] = pd.to_datetime(m["ym"] + "-01").dt.days_in_month
        m["complete"] = m["days"] == m["days_in_month"]
        stats = d.groupby("ym").agg(
            fire_days=("n_pixels", "size"), pixels=("n_pixels", "sum"), frp_sum=("frp_sum", "sum"),
            fire_days_dayonly=("n_day", lambda s: int((s > 0).sum())))
        stats["active_cells"] = d.groupby("ym").apply(lambda x: len(x[["ix", "iy"]].drop_duplicates()), include_groups=False)
        for name, e in extra.items():
            es = e[(e["sat"] == sat) & (e["date_local"] >= first) & (e["date_local"] <= last)]
            stats[name] = es.groupby(es["date_local"].dt.strftime("%Y-%m")).size()
        m = m.merge(stats, on="ym", how="left").fillna(
            {c: 0 for c in ["fire_days", "pixels", "frp_sum", "fire_days_dayonly", "active_cells", "fd_010", "fd_050"]})
        m.insert(0, "sat", sat)
        monthly_rows.append(m.drop(columns=["first_day"]))

    monthly = pd.concat(monthly_rows, ignore_index=True)
    for c in ["fire_days", "pixels", "fire_days_dayonly", "active_cells", "fd_010", "fd_050"]:
        monthly[c] = monthly[c].astype("int64")
    daily = pd.concat(daily_rows, ignore_index=True)
    cell = fd.groupby(["sat", "ym", "ix", "iy"]).size().rename("fire_days").reset_index()

    out = DATA / "agg" / region_id
    out.mkdir(parents=True, exist_ok=True)
    monthly.to_parquet(out / "monthly.parquet", index=False)
    daily.to_parquet(out / "daily.parquet", index=False)
    cell.to_parquet(out / "cellmonthly.parquet", index=False)
    clim = climate(monthly)
    write_json(out / "climate.json", clim)
    span = monthly.groupby("sat").agg(first=("ym", "min"), last=("ym", "max"), fire_days=("fire_days", "sum"))
    print(f"[aggregate] {region_id}\n{span.to_string()}\n  fire year starts month {clim['fireYearStartMonth']}, "
          f"critical months {clim['criticalMonths']}", flush=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--region")
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()
    cfg = load_config()
    for rid in region_ids(cfg, args.region, args.all, "grid/{region}"):
        aggregate_region(cfg, rid)


if __name__ == "__main__":
    main()
