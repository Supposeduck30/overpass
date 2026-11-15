"""Stage 2: raw FIRMS CSVs -> one clean parquet per satellite.

Applies the qualifying-detection rules (type, confidence), converts to local solar
date, and drops untyped near-real-time rows that sit on known static heat sources.
"""
from __future__ import annotations

import argparse

import numpy as np
import pandas as pd

from lib.country import CountryMask
from lib.io import DATA, get_region, load_config, region_ids, write_json
from lib.solar import local_solar

BASE_COLS = ["latitude", "longitude", "scan", "track", "acq_date", "acq_time", "satellite",
             "instrument", "confidence", "version", "frp", "daynight"]
MODIS_COLS = BASE_COLS + ["brightness", "bright_t31"]
VIIRS_COLS = BASE_COLS + ["bright_ti4", "bright_ti5"]

# Every value seen in real files on 2026-11-14. Anything else is a hard error.
SATELLITE_MAP = {"Terra": "terra", "T": "terra", "Aqua": "aqua", "A": "aqua",
                 "N": "snpp", "N20": "noaa20", "N21": "noaa21"}
# raw source -> (instrument family, satellites it may contain, processing level)
SOURCES = {
    "archive/modis": ("modis", {"terra", "aqua"}, "archive"),
    "archive/viirs-snpp": ("viirs", {"snpp"}, "archive"),
    "MODIS_SP": ("modis", {"terra", "aqua"}, "sp"),
    "MODIS_NRT": ("modis", {"terra", "aqua"}, "nrt"),
    "VIIRS_SNPP_SP": ("viirs", {"snpp"}, "sp"),
    "VIIRS_SNPP_NRT": ("viirs", {"snpp"}, "nrt"),
    "VIIRS_NOAA20_SP": ("viirs", {"noaa20"}, "sp"),
    "VIIRS_NOAA20_NRT": ("viirs", {"noaa20"}, "nrt"),
    "VIIRS_NOAA21_SP": ("viirs", {"noaa21"}, "sp"),
    "VIIRS_NOAA21_NRT": ("viirs", {"noaa21"}, "nrt"),
}
MASK_DEG = 0.01


def read_raw(path, family: str, allowed: set[str], proc: str) -> pd.DataFrame:
    df = pd.read_csv(path, dtype=str, keep_default_na=False)
    df.columns = [c.lower() for c in df.columns]
    need = MODIS_COLS if family == "modis" else VIIRS_COLS
    missing = [c for c in need if c not in df.columns]
    assert not missing, f"{path}: missing columns {missing}; found {list(df.columns)}"
    if df.empty:
        return pd.DataFrame()
    unknown = set(df["satellite"].unique()) - set(SATELLITE_MAP)
    assert not unknown, f"{path}: unknown satellite values {unknown}"
    sat = df["satellite"].map(SATELLITE_MAP)
    assert set(sat.unique()) <= allowed, f"{path}: satellites {set(sat.unique())} not expected here"
    out = pd.DataFrame({
        "ts_utc": pd.to_datetime(df["acq_date"] + " " + df["acq_time"].str.zfill(4), format="%Y-%m-%d %H%M"),
        "lat": df["latitude"].astype("float64"),
        "lon": df["longitude"].astype("float64"),
        "frp": pd.to_numeric(df["frp"], errors="coerce").astype("float32"),
        "daynight": df["daynight"],
        "confidence": df["confidence"],
        "sat": sat,
        "type": pd.to_numeric(df["type"], errors="coerce") if "type" in df.columns else np.nan,
        "proc": proc,
        "family": family,
    })
    return out


def load_region_raw(region_id: str) -> pd.DataFrame:
    raw = DATA / "raw" / region_id
    frames = []
    for src, (family, allowed, proc) in SOURCES.items():
        if src.startswith("archive/"):
            files = sorted((raw / "archive").glob(src.split("/")[1] + "_*.csv"))
        else:
            files = sorted((raw / "area" / src).glob("*.csv"))
        n = 0
        for f in files:
            d = read_raw(f, family, allowed, proc)
            n += len(d)
            if len(d):
                frames.append(d)
        print(f"  raw {src}: {len(files)} files, {n} rows", flush=True)
    if not frames:
        raise SystemExit(f"No raw data for {region_id}; run fetch.py first")
    return pd.concat(frames, ignore_index=True)


def mask_key(lat: pd.Series, lon: pd.Series) -> pd.Series:
    iy = np.floor((lat + 90) / MASK_DEG).astype("int64")
    ix = np.floor((lon + 180) / MASK_DEG).astype("int64")
    return iy * 100_000 + ix


def static_keys(df: pd.DataFrame, cfg: dict) -> list[int]:
    """0.01-degree cells where a typed archive row was not vegetation fire. The live function applies the same mask."""
    static = df[df["type"].notna() & ~df["type"].isin(cfg["keep_types"])]
    return sorted(int(k) for k in mask_key(static["lat"], static["lon"]).unique())


def clean_frame(df: pd.DataFrame, cfg: dict, bbox: list[float]) -> tuple[pd.DataFrame, dict]:
    """Apply every qualifying-detection rule. Returns the clean rows and a count per step."""
    counts = {"raw": len(df)}
    w, s, e, n = bbox
    df = df[(df["lat"] >= s) & (df["lat"] < n) & (df["lon"] >= w) & (df["lon"] < e)]
    df = df.drop_duplicates(subset=["ts_utc", "lat", "lon", "sat"])
    counts["in_bbox_unique"] = len(df)

    typed = df["type"].notna()
    static = df[typed & ~df["type"].isin(cfg["keep_types"])]
    static_cells = set(mask_key(static["lat"], static["lon"]).unique())
    on_static = mask_key(df["lat"], df["lon"]).isin(static_cells)
    keep = (typed & df["type"].isin(cfg["keep_types"])) | (~typed & ~on_static)
    counts["dropped_type"] = int((typed & ~df["type"].isin(cfg["keep_types"])).sum())
    counts["dropped_static_mask"] = int((~typed & on_static).sum())
    df = df[keep]

    is_modis = df["family"] == "modis"
    modis_ok = pd.to_numeric(df["confidence"].where(is_modis), errors="coerce") >= cfg["modis_min_confidence"]
    viirs_ok = df["confidence"].str.lower().isin(cfg["viirs_keep_confidence"])
    ok = (is_modis & modis_ok) | (~is_modis & viirs_ok)
    counts["dropped_confidence"] = int((~ok).sum())
    df = df[ok].copy()

    df["date_local"], df["lst_hour"] = local_solar(df["ts_utc"], df["lon"])
    df["type_known"] = df["type"].notna()
    counts["clean"] = len(df)
    cols = ["ts_utc", "date_local", "lst_hour", "lat", "lon", "frp", "daynight", "confidence",
            "sat", "type_known", "proc"]
    return df[cols].sort_values("ts_utc").reset_index(drop=True), counts


def clean_region(cfg: dict, region_id: str) -> None:
    region = get_region(cfg, region_id)
    print(f"[clean] {region_id}", flush=True)
    raw = load_region_raw(region_id)
    # Archives are per country and the Area API is per box, so every source is cut to the country.
    mask = CountryMask(DATA / "geo_raw", region.get("outline", region["country"].replace("_", " ")), region["bbox"])
    in_country = mask(raw["lat"].to_numpy(), raw["lon"].to_numpy())
    print(f"  {mask.share:.0%} of the box is inside the country; {int((~in_country).sum())} rows fall outside", flush=True)
    raw = raw[in_country]
    df, counts = clean_frame(raw, cfg, region["bbox"])
    print(f"  {counts}", flush=True)
    out = DATA / "clean" / region_id
    out.mkdir(parents=True, exist_ok=True)
    w, s, e, n = region["bbox"]
    inside = raw[(raw["lat"] >= s) & (raw["lat"] < n) & (raw["lon"] >= w) & (raw["lon"] < e)]
    write_json(out / "static.json", {"deg": MASK_DEG, "keys": static_keys(inside, cfg)}, compact=True)
    for sat, d in df.groupby("sat"):
        d.to_parquet(out / f"{sat}.parquet", index=False)
        print(f"  {sat}: {len(d)} rows, {d['date_local'].min().date()} .. {d['date_local'].max().date()}, "
              f"proc {d['proc'].value_counts().to_dict()}", flush=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--region")
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()
    cfg = load_config()
    for rid in region_ids(cfg, args.region, args.all, "raw/{region}/fetch_log.json"):
        clean_region(cfg, rid)


if __name__ == "__main__":
    main()
