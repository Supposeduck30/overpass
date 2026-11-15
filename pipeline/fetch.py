"""Stage 1: download FIRMS detections for a region.

History comes from the country yearly archives (no key), stream-filtered to the bbox.
Everything after the last archive year comes from the Area API in 5-day chunks,
standard processing first and near-real-time after it. Every response is cached on disk.
"""
from __future__ import annotations

import argparse
import datetime as dt
import io
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pandas as pd
import requests

from lib.io import DATA, get_region, load_config, map_key, region_ids, write_json

ARCHIVE_PRODUCTS = {"modis": 2000, "viirs-snpp": 2012}  # product -> first year
# family -> (SP source, NRT source); start dates are decided in area_plan()
AREA_FAMILIES = {
    "modis": ("MODIS_SP", "MODIS_NRT"),
    "snpp": ("VIIRS_SNPP_SP", "VIIRS_SNPP_NRT"),
    "noaa20": ("VIIRS_NOAA20_SP", "VIIRS_NOAA20_NRT"),
    "noaa21": ("VIIRS_NOAA21_SP", "VIIRS_NOAA21_NRT"),
}
SESSION = requests.Session()


def budget_spent(r: requests.Response) -> bool:
    """FIRMS answers a spent transaction budget with HTTP 400 or 401 "Invalid MAP_KEY.", so ask the key's status."""
    if r.status_code not in (400, 401) or "Invalid MAP_KEY" not in r.text[:100]:
        return False
    status = SESSION.get(f"https://firms.modaps.eosdis.nasa.gov/mapserver/mapkey_status/?MAP_KEY={map_key()}", timeout=60)
    try:
        info = status.json()
    except ValueError:
        return False
    return info.get("current_transactions", 0) >= info.get("transaction_limit", 1)


def get(url: str, stream: bool = False) -> requests.Response:
    """GET with two retries and backoff; 429 waits a minute. The key never reaches a log."""
    shown = url.replace(map_key() or "\0", "KEY")
    last = None
    attempt = waits = 0
    while attempt < 3:
        try:
            r = SESSION.get(url, stream=stream, timeout=120)
            if r.status_code == 429 or (not stream and "Exceeding allowed transaction" in r.text[:200]) or budget_spent(r):
                # The key allows 5,000 transactions per 10 minutes; a 5-day area call costs about 10.
                waits += 1
                if waits > 20:
                    raise SystemExit(f"FETCH FAILED {shown}: still rate limited after 20 minutes")
                time.sleep(60)
                continue
            if r.status_code in (200, 404):
                return r
            last = f"HTTP {r.status_code}"
        except requests.RequestException as e:
            last = type(e).__name__
        attempt += 1
        time.sleep(5 * attempt)
    raise SystemExit(f"FETCH FAILED {shown}: {last}")


def fetch_availability(cfg: dict) -> pd.DataFrame:
    key = map_key()
    if not key:
        raise SystemExit("FIRMS_MAP_KEY missing: put it in pipeline/.env")
    r = get(f"{cfg['api_base']}/data_availability/csv/{key}/all")
    df = pd.read_csv(io.StringIO(r.text))
    assert list(df.columns) == ["data_id", "min_date", "max_date"], f"availability columns: {list(df.columns)}"
    out = DATA / "raw" / "availability.csv"
    out.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out, index=False)
    print(df.to_string(index=False), flush=True)
    return df


def stream_year(url: str, tmp, bbox: list[float]) -> int | None:
    """Write the rows of one country-year file that fall inside the bbox. None if the file does not exist."""
    w, s, e, n = bbox
    r = get(url, stream=True)
    if r.status_code == 404:
        return None
    kept = 0
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        lines = r.iter_lines(decode_unicode=True)
        header = next(lines)
        assert header.split(",")[:2] == ["latitude", "longitude"], f"{url}: unexpected header {header}"
        f.write(header + "\n")
        for line in lines:
            if not line:
                continue
            a, b, _ = line.split(",", 2)
            if s <= float(a) < n and w <= float(b) < e:
                f.write(line + "\n")
                kept += 1
    return kept


def fetch_archive(cfg: dict, region: dict, only_missing: bool) -> dict:
    """Stream each country-year file, keep rows inside the bbox. Returns last year per product."""
    out_dir = DATA / "raw" / region["id"] / "archive"
    out_dir.mkdir(parents=True, exist_ok=True)
    last_year, rows = {}, {}
    for product, first in ARCHIVE_PRODUCTS.items():
        for year in range(first, dt.date.today().year + 1):
            out = out_dir / f"{product}_{year}.csv"
            if out.exists():
                last_year[product] = year
                continue
            url = f"{cfg['archive_base']}/{product}/{year}/{product}_{year}_{region['country']}.csv"
            tmp = out.with_suffix(".part")
            kept = None
            for attempt in range(1, 5):
                try:
                    kept = stream_year(url, tmp, region["bbox"])
                    break
                except requests.RequestException as e:
                    # A long country file can drop mid-stream; the partial file is discarded and re-read.
                    if attempt == 4:
                        raise SystemExit(f"FETCH FAILED {url}: {type(e).__name__}")
                    time.sleep(10 * attempt)
            if kept is None:
                if year == first:
                    raise SystemExit(f"FETCH FAILED {url}: 404 on the first year; check the country name")
                break
            tmp.replace(out)
            last_year[product] = year
            rows[out.name] = kept
            print(f"  archive {product} {year}: {kept} rows in bbox", flush=True)
    return {"last_year": last_year, "rows": rows}


def area_plan(cfg: dict, avail: pd.DataFrame, last_archive: dict) -> list[tuple[str, dt.date, dt.date]]:
    """(source, first date, last date) spans the Area API has to cover."""
    a = {r.data_id: (dt.date.fromisoformat(r.min_date), dt.date.fromisoformat(r.max_date)) for r in avail.itertuples()}
    after = {
        "modis": dt.date(last_archive["modis"] + 1, 1, 1),
        "snpp": dt.date(last_archive["viirs-snpp"] + 1, 1, 1),
        "noaa20": dt.date.fromisoformat(str(cfg["link2_start"])),
        "noaa21": dt.date(dt.date.today().year, 1, 1),  # cross-check only
    }
    plan = []
    for fam, (sp, nrt) in AREA_FAMILIES.items():
        start = after[fam]
        sp_end = start - dt.timedelta(days=1)
        if sp in a:
            sp_start = max(start, a[sp][0])
            sp_end = a[sp][1]
            if sp_start <= sp_end:
                plan.append((sp, sp_start, sp_end))
        if nrt in a:
            nrt_start = max(sp_end + dt.timedelta(days=1), a[nrt][0], start)
            if nrt_start <= a[nrt][1]:
                plan.append((nrt, nrt_start, a[nrt][1]))
    return plan


def fetch_area(cfg: dict, region: dict, plan: list, only_missing: bool) -> dict:
    key = map_key()
    step = int(cfg["area_day_range"])
    bbox = ",".join(str(v) for v in region["bbox"])
    today = dt.date.today()
    jobs = []
    for source, first, last in plan:
        d = first
        while d <= last:
            days = min(step, (last - d).days + 1)
            out = DATA / "raw" / region["id"] / "area" / source / f"{d.isoformat()}.csv"
            # A chunk that reaches the last two days may still be filling in; fetch it again.
            fresh = d + dt.timedelta(days=days - 1) >= today - dt.timedelta(days=1)
            if not out.exists() or (fresh and not only_missing):
                jobs.append((source, d, days, out))
            d += dt.timedelta(days=days)
    print(f"  area: {len(jobs)} calls to make", flush=True)
    rows: dict[str, int] = {}

    def one(job):
        source, d, days, out = job
        r = get(f"{cfg['api_base']}/area/csv/{key}/{source}/{bbox}/{days}/{d.isoformat()}")
        text = r.text
        if r.status_code != 200 or not text.startswith("latitude,longitude"):
            raise SystemExit(f"FETCH FAILED area {source} {d}: HTTP {r.status_code}: {text[:120]!r}")
        out.parent.mkdir(parents=True, exist_ok=True)
        tmp = out.with_suffix(".part")
        tmp.write_text(text, encoding="utf-8", newline="\n")
        tmp.replace(out)
        time.sleep(0.2)
        return source, text.count("\n") - 1

    with ThreadPoolExecutor(max_workers=4) as pool:
        for i, (source, n) in enumerate(pool.map(one, jobs), 1):
            rows[source] = rows.get(source, 0) + max(n, 0)
            if i % 100 == 0:
                print(f"  area: {i}/{len(jobs)}", flush=True)
    return rows


def fetch_region(cfg: dict, region_id: str, avail: pd.DataFrame, only_missing: bool) -> None:
    region = get_region(cfg, region_id)
    print(f"[fetch] {region_id}", flush=True)
    arch = fetch_archive(cfg, region, only_missing)
    plan = area_plan(cfg, avail, arch["last_year"])
    for source, first, last in plan:
        print(f"  plan {source}: {first} .. {last}", flush=True)
    area_rows = fetch_area(cfg, region, plan, only_missing)
    write_json(DATA / "raw" / region_id / "fetch_log.json", {
        "fetchedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "lastArchiveYear": arch["last_year"],
        "archiveRowsThisRun": arch["rows"],
        "areaPlan": [[s, a.isoformat(), b.isoformat()] for s, a, b in plan],
        "areaRowsThisRun": area_rows,
    })
    print(f"[fetch] {region_id} done; area rows this run: {area_rows}", flush=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--region")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--only-missing", action="store_true", help="never refetch a cached chunk")
    args = ap.parse_args()
    cfg = load_config()
    avail = fetch_availability(cfg)
    failed = []
    for rid in region_ids(cfg, args.region, args.all):
        try:
            fetch_region(cfg, rid, avail, args.only_missing)
        except SystemExit as e:
            if not args.all and "," not in (args.region or ""):
                raise
            print(f"[fetch] {rid} FAILED: {e}", flush=True)
            failed.append(rid)
    if failed:
        sys.exit(f"Failed regions: {failed}")


if __name__ == "__main__":
    main()
