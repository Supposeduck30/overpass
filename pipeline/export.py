"""Stage 10: write the files the web app reads (web/public/data/). Every number on screen comes from here."""
from __future__ import annotations

import argparse
import datetime as dt
import gzip
import math
import shutil
import subprocess

import numpy as np
import pandas as pd

from lib.gridding import cell_center
from lib.io import DATA, ROOT, WEB_DATA, get_region, load_config, read_json, region_ids, write_json

SIZE_LIMIT_MB = 80
SATS = ["aqua", "terra", "snpp", "noaa20", "noaa21"]


def num(v, digits: int = 2):
    """JSON-safe number: NaN becomes null, floats are rounded."""
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    return round(float(v), digits)


def scrub(obj):
    if isinstance(obj, dict):
        return {k: scrub(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [scrub(v) for v in obj]
    if isinstance(obj, (float, np.floating)):
        return None if math.isnan(obj) else round(float(obj), 5)
    if isinstance(obj, np.integer):
        return int(obj)
    if isinstance(obj, np.bool_):
        return bool(obj)
    return obj


def monthly_json(cfg: dict, region_id: str) -> dict:
    hm = pd.read_parquet(DATA / "harmonized" / region_id / "monthly.parquet")
    model = read_json(DATA / "model" / f"{region_id}.json")
    hm["month"] = hm["ym"].str[5:].astype(int)
    full = hm[~hm["partial"]]
    normals = full.groupby("month")["harmonized"].median().reindex(range(1, 13))
    months = []
    for r in hm.itertuples():
        past = full[(full["month"] == r.month) & (full["ym"] < r.ym)]["harmonized"].to_numpy()
        months.append({
            "ym": r.ym, "harmonized": num(r.harmonized), "lo": num(r.lo), "hi": num(r.hi),
            "source": r.source, "partial": bool(r.partial),
            "raw": {s: num(getattr(r, f"raw_{s}"), 0) for s in SATS},
            "pixels": {s: num(getattr(r, f"pix_{s}"), 0) for s in SATS},
            # "Normal" is the median of all past same-calendar-months; percentile is the rank among them.
            "median": num(np.median(past)) if len(past) else None,
            "percentile": num(100.0 * np.mean(past <= r.harmonized), 1) if len(past) and not r.partial else None,
        })
    links = {name: {"model": l["model"], "params": l["params"], "fit": l["fit"], "factor": l["factor"],
                    "exchange": l["exchange"], "coverage90": l["coverage90"]} for name, l in model["links"].items()}
    return {"region": region_id, "unit": "VIIRS-equivalent fire-days", "unitColumn": model["unit"], "links": links,
            "normals": [num(v) for v in normals.to_numpy()], "months": months}


def cells_json(cfg: dict, region_id: str) -> dict:
    g = cfg["grid_deg"]
    c = pd.read_parquet(DATA / "harmonized" / region_id / "cellmonthly.parquet")
    c = c[c["value"] >= 0.005]
    months = sorted(c["ym"].unique())
    keys = c[["ix", "iy"]].drop_duplicates().sort_values(["iy", "ix"]).reset_index(drop=True)
    keys["ci"] = keys.index
    c = c.merge(keys, on=["ix", "iy"])
    mi = {ym: i for i, ym in enumerate(months)}
    lat, lon = cell_center(keys["ix"], keys["iy"], g)
    values = [[mi[ym], int(ci), round(float(v), 2)] for ym, ci, v in zip(c["ym"], c["ci"], c["value"])]
    return {"grid": g, "cells": [[round(float(a), 3), round(float(b), 3)] for a, b in zip(lat, lon)],
            "months": months, "values": values}


def hotspots(region_id: str, out_dir) -> int:
    """Per-year gzipped CSVs of the qualifying detections behind the calendar."""
    frames = [pd.read_parquet(f) for f in sorted((DATA / "clean" / region_id).glob("*.parquet"))]
    df = pd.concat(frames, ignore_index=True).sort_values("ts_utc")
    out = pd.DataFrame({
        "date_local": df["date_local"].dt.strftime("%Y-%m-%d"), "time_utc": df["ts_utc"].dt.strftime("%Y-%m-%dT%H:%MZ"),
        "lat": df["lat"].round(5), "lon": df["lon"].round(5), "satellite": df["sat"], "confidence": df["confidence"],
        "frp": df["frp"].round(2), "daynight": df["daynight"], "processing": df["proc"]})
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True)
    total = 0
    for year, g in out.groupby(out["date_local"].str[:4]):
        path = out_dir / f"{year}.csv.gz"
        # No timestamp or name in the header, so an unchanged year gives an identical file.
        with open(path, "wb") as raw, gzip.GzipFile(filename="", mode="wb", fileobj=raw, compresslevel=9, mtime=0) as z:
            z.write(g.to_csv(index=False, lineterminator="\n").encode("utf-8"))
        total += path.stat().st_size
    return total


def export_region(cfg: dict, region_id: str) -> None:
    out = WEB_DATA / region_id
    out.mkdir(parents=True, exist_ok=True)
    write_json(out / "monthly.json", scrub(monthly_json(cfg, region_id)), compact=True)
    write_json(out / "cells.json", cells_json(cfg, region_id), compact=True)
    write_json(out / "validation.json", scrub(read_json(DATA / "validation" / f"{region_id}.json")), compact=True)
    write_json(out / "clock.json", scrub(read_json(DATA / "clock" / f"{region_id}.json")), compact=True)
    shutil.copyfile(DATA / "clean" / region_id / "static.json", out / "static.json")
    for name in ("mtd.json", "season.json"):
        shutil.copyfile(DATA / "nowcast" / region_id / name, out / name)
    (WEB_DATA / "current").mkdir(parents=True, exist_ok=True)
    shutil.copyfile(DATA / "nowcast" / region_id / "current.json", WEB_DATA / "current" / f"{region_id}.json")
    size = hotspots(region_id, out / "hotspots")
    print(f"[export] {region_id}: hotspots {size / 1e6:.1f} MB", flush=True)


def atlas_entry(region_id: str) -> dict:
    v = read_json(DATA / "validation" / f"{region_id}.json")
    by = {r["model"]: r for r in v["ladder"]}
    chosen = next(r for r in v["ladder"] if r["chosen"])
    return {"id": region_id, "model": chosen["model"], "exchangeRate": v["exchange"]["rate"],
            "lo": v["exchange"]["lo"], "hi": v["exchange"]["hi"], "atSourceCount": v["exchange"]["atSourceCount"],
            "medApeOurs": chosen["medApe"], "medApeGlobalFactor": by["M0"]["medApe"],
            "coverage90": v["coverage90"], "link2Factor": v["handoff"]["factor"],
            "link2Lo": v["handoff"]["lo"], "link2Hi": v["handoff"]["hi"], "link2Model": v["handoff"]["model"]}


def folder_mb(path) -> float:
    return sum(f.stat().st_size for f in path.rglob("*") if f.is_file()) / 1e6


def export_shared(cfg: dict) -> None:
    ready = [r["id"] for r in cfg["regions"] if (WEB_DATA / r["id"] / "monthly.json").exists()]
    regions = []
    for rid in ready:
        r = get_region(cfg, rid)
        clim = read_json(DATA / "agg" / rid / "climate.json")
        regions.append({"id": rid, "name": r["name"], "bbox": r["bbox"], "tier": r["tier"],
                        "fireYearStartMonth": clim["fireYearStartMonth"], "criticalMonths": clim["criticalMonths"]})
    write_json(WEB_DATA / "regions.json", regions)
    write_json(WEB_DATA / "atlas.json", scrub([atlas_entry(rid) for rid in ready]))

    dropped = []
    for rid in reversed([r["id"] for r in regions if r["tier"] == "atlas"]):
        if folder_mb(WEB_DATA) <= SIZE_LIMIT_MB:
            break
        shutil.rmtree(WEB_DATA / rid / "hotspots", ignore_errors=True)
        dropped.append(rid)
    for r in regions:
        r["hotspots"] = (WEB_DATA / r["id"] / "hotspots").exists()
    write_json(WEB_DATA / "regions.json", regions)

    avail = pd.read_csv(DATA / "raw" / "availability.csv")
    last = {}
    for rid in ready:
        last[rid] = {f.stem: str(pd.read_parquet(f, columns=["date_local"])["date_local"].max().date())
                     for f in sorted((DATA / "clean" / rid).glob("*.parquet"))}
    try:
        commit = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    except OSError:
        commit = ""
    write_json(WEB_DATA / "meta.json", {
        "builtAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "commit": commit, "availability": avail.to_dict("records"), "lastDate": last,
        "hotspotsDropped": dropped, "sizeMb": round(folder_mb(WEB_DATA), 1)})
    print(f"[export] shared: {len(ready)} regions, {folder_mb(WEB_DATA):.1f} MB, dropped hotspots for {dropped}", flush=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--region")
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()
    cfg = load_config()
    for rid in region_ids(cfg, args.region, args.all, "validation/{region}.json"):
        export_region(cfg, rid)
    export_shared(cfg)


if __name__ == "__main__":
    main()
