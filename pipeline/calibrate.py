"""Stage 5: choose and fit the translation for each satellite handoff, then build the harmonized record.

Link 1 translates Aqua MODIS into S-NPP units (fit on the clean 2012-2020 overlap).
Link 2 translates NOAA-20 into S-NPP units (fit on their overlap up to S-NPP's last full month).
The Terra link translates Terra MODIS into S-NPP units for the months before Aqua (Nov 2000 to Jun 2002).
Regional totals are modelled; cells receive a share of the regional total (top-down).
"""
from __future__ import annotations

import argparse

import numpy as np
import pandas as pd

from lib import models
from lib.io import DATA, load_config, read_json, region_ids, write_json

FIRST_SNPP_MONTH = "2012-02"
SOURCE_SHARE_WEIGHT = 0.7
COVERAGE_FLOOR = 0.85
SOURCE_SAT = {"terra-translated": "terra", "aqua-translated": "aqua", "snpp": "snpp", "noaa20-translated": "noaa20"}


def load_monthly(region_id: str) -> pd.DataFrame:
    return pd.read_parquet(DATA / "agg" / region_id / "monthly.parquet")


def wide(monthly: pd.DataFrame, col: str, complete_only: bool = True) -> pd.DataFrame:
    m = monthly[monthly["complete"]] if complete_only else monthly
    return m.pivot(index="ym", columns="sat", values=col).sort_index()


def overlap_frame(region_id: str, source: str, target: str, first: str, last: str, unit: str) -> pd.DataFrame:
    """Months where both satellites have a complete month, as a model frame."""
    w = wide(load_monthly(region_id), unit)
    if source not in w or target not in w:
        return pd.DataFrame(columns=["ym", "year", "month", "m", "v", "season", "region"])
    w = w.loc[first:last, [source, target]].dropna()
    critical = read_json(DATA / "agg" / region_id / "climate.json")["criticalMonths"]
    d = pd.DataFrame({"ym": w.index, "m": w[source].to_numpy(float), "v": w[target].to_numpy(float)})
    d["year"] = d["ym"].str[:4].astype(int)
    d["month"] = d["ym"].str[5:].astype(int)
    d["season"] = d["month"].isin(critical)
    d["region"] = region_id
    return d


def link_windows(cfg: dict, region_id: str) -> dict:
    snpp = load_monthly(region_id)
    snpp = snpp[(snpp["sat"] == "snpp") & snpp["complete"]]
    last_snpp = snpp["ym"].max()
    y0, y1 = cfg["calibration_years"]
    return {
        "aqua_snpp": ("aqua", "snpp", max(f"{y0}-01", FIRST_SNPP_MONTH), f"{y1}-12"),
        "terra_snpp": ("terra", "snpp", max(f"{y0}-01", FIRST_SNPP_MONTH), f"{y1}-12"),
        "noaa20_snpp": ("noaa20", "snpp", str(cfg["link2_start"])[:7], last_snpp),
    }


def pooled(cfg: dict, link: str, unit: str) -> pd.DataFrame:
    frames = []
    for r in cfg["regions"]:
        if (DATA / "agg" / r["id"] / "monthly.parquet").exists():
            src, tgt, first, last = link_windows(cfg, r["id"])[link]
            frames.append(overlap_frame(r["id"], src, tgt, first, last, unit))
    return pd.concat(frames, ignore_index=True)


def factor_interval(d: pd.DataFrame, iterations: int, rng: np.random.Generator) -> tuple[float, float, float]:
    """Ratio of sums with a year-block bootstrap 90% interval."""
    years = np.sort(d["year"].unique())
    by_year = d.groupby("year")[["m", "v"]].sum()
    draws = []
    for _ in range(iterations):
        pick = by_year.loc[rng.choice(years, len(years))]
        if pick["m"].sum() > 0:
            draws.append(pick["v"].sum() / pick["m"].sum())
    lo, hi = np.quantile(draws, [0.05, 0.95])
    return float(d["v"].sum() / d["m"].sum()), float(lo), float(hi)


def exchange_rate(rung: str, d: pd.DataFrame, pool, iterations: int, rng: np.random.Generator) -> dict:
    """Target ÷ source at the region's median burning month, with parameter uncertainty only."""
    burning = d.loc[d["m"] > 0, "m"]
    m_med = float(burning.median()) if len(burning) else 1.0
    point = float(models.predict(models.fit(rung, d, pool), [m_med], [True])[0] / m_med)
    years = np.sort(d["year"].unique())
    draws = []
    for _ in range(iterations):
        pick = rng.choice(years, len(years))
        params = models.fit(rung, models._resample_years(d, pick),
                            None if pool is None else models._resample_years(pool, pick))
        draws.append(models.predict(params, [m_med], [True])[0] / m_med)
    lo, hi = np.quantile(draws, [0.05, 0.95])
    return {"atSourceCount": m_med, "rate": point, "lo": float(lo), "hi": float(hi)}


def fit_link(cfg: dict, region_id: str, link: str, unit: str, rng: np.random.Generator) -> dict:
    src, tgt, first, last = link_windows(cfg, region_id)[link]
    d = overlap_frame(region_id, src, tgt, first, last, unit)
    if len(d) < 24 or d["m"].sum() == 0:
        raise SystemExit(f"{region_id} {link}: only {len(d)} overlap months with data; cannot calibrate")
    pool = pooled(cfg, link, unit)
    B = int(cfg["bootstrap_iterations"])
    rows, preds = models.ladder(d, pool)
    chosen = models.select(rows, preds, d["v"])
    notes = []
    if pool["region"].nunique() == 1:
        notes.append(f"{link}: only one region prepared, so the global factor (M0) equals the regional factor (M1).")

    identity_row = None
    factor = factor_interval(d, B, rng)
    if link == "noaa20_snpp":
        identity_row = {"model": "identity", **models.metrics(d["m"], d["v"])}
        best = next(r for r in rows if r["model"] == chosen)
        contains_one = factor[1] <= 1.0 <= factor[2]
        within_noise = identity_row["medApe"] <= best["medApe"] * (1 + models.COMPLEXITY_MARGIN)
        if contains_one and within_noise:
            chosen = "identity"
            notes.append(f"{link}: the fitted factor {factor[0]:.3f} ({factor[1]:.3f}–{factor[2]:.3f}) contains 1 "
                         "and no rung beats leaving NOAA-20 unadjusted, so NOAA-20 counts are used as they are.")
        else:
            notes.append(f"{link}: NOAA-20 is not interchangeable with S-NPP here: factor {factor[0]:.3f} "
                         f"({factor[1]:.3f}–{factor[2]:.3f}); identity error {identity_row['medApe']:.3f} "
                         f"vs {best['model']} {best['medApe']:.3f}.")

    cv = models.loyo_interval(chosen, d, pool, B, rng)
    cov_raw = models.coverage(cv)
    scale = 1.0
    cov = cov_raw
    if cov_raw < COVERAGE_FLOOR:
        scale = models.conformal_scale(cv["pred"], cv["lo"], cv["hi"], cv["v"])
        cv["lo"], cv["hi"] = models.widen(cv["pred"], cv["lo"], cv["hi"], scale)
        cov = models.coverage(cv)
        notes.append(f"{link}: held-out 90% interval coverage was {cov_raw:.0%}; intervals were widened ×{scale:.2f} "
                     f"(conformal adjustment from the same held-out residuals), giving {cov:.0%}.")

    all_rows = ([identity_row] if identity_row else []) + rows
    for r in all_rows:
        r["chosen"] = r["model"] == chosen
    return {
        "source": src, "target": tgt, "fit": f"{d['ym'].min()}..{d['ym'].max()}", "months": int(len(d)),
        "model": chosen, "params": models.fit(chosen, d, pool), "ladder": all_rows,
        "coverage90Raw": cov_raw, "coverage90": cov, "intervalScale": scale,
        "factor": {"value": factor[0], "lo": factor[1], "hi": factor[2]},
        "exchange": exchange_rate(chosen, d, pool, B, rng),
        "pooledRegions": sorted(pool["region"].unique().tolist()),
        "notes": notes,
    }


def translate(link: dict, cfg: dict, region_id: str, link_name: str, unit: str, m, season,
              rng: np.random.Generator):
    src, tgt, first, last = link_windows(cfg, region_id)[link_name]
    d = overlap_frame(region_id, src, tgt, first, last, unit)
    pool = pooled(cfg, link_name, unit)
    point = models.predict(link["params"], m, season)
    lo, hi = models.interval(link["model"], d, pool, m, season, int(cfg["bootstrap_iterations"]), rng)
    lo, hi = np.minimum(lo, point), np.maximum(hi, point)
    if link["intervalScale"] != 1.0:
        lo, hi = models.widen(point, lo, hi, link["intervalScale"])
    return point, lo, hi


def outage_month(cfg: dict, sat: str, ym: str) -> bool:
    return any(a[:7] <= ym <= b[:7] for a, b in cfg.get("outages", {}).get(sat, []))


def build_monthly(cfg: dict, region_id: str, links: dict, unit: str, rng: np.random.Generator) -> pd.DataFrame:
    monthly = load_monthly(region_id)
    val = wide(monthly, unit, complete_only=False)
    pix = wide(monthly, "pixels", complete_only=False)
    done = wide(monthly, "complete", complete_only=False).fillna(False).astype(bool)
    critical = read_json(DATA / "agg" / region_id / "climate.json")["criticalMonths"]
    last_snpp = monthly[(monthly["sat"] == "snpp") & monthly["complete"]]["ym"].max()
    # Aqua's first month (July 2002) starts on the 4th, so Terra carries the record until Aqua's first full month.
    first_aqua = done["aqua"][done["aqua"]].index.min()
    yms = [ym for ym in val.index if ym >= val["terra"].first_valid_index()]

    out = pd.DataFrame({"ym": yms})
    out["month"] = out["ym"].str[5:].astype(int)
    season = out["month"].isin(critical).to_numpy()
    out["source"] = np.where(out["ym"] < first_aqua, "terra-translated",
                             np.where(out["ym"] < FIRST_SNPP_MONTH, "aqua-translated",
                                      np.where(out["ym"] <= last_snpp, "snpp", "noaa20-translated")))
    for sat in ["aqua", "terra", "snpp", "noaa20", "noaa21"]:
        out[f"raw_{sat}"] = val[sat].reindex(yms).to_numpy() if sat in val else np.nan
        out[f"pix_{sat}"] = pix[sat].reindex(yms).to_numpy() if sat in pix else np.nan
    src_sat = out["source"].map(SOURCE_SAT)
    out["partial"] = [not bool(done.at[ym, s]) or outage_month(cfg, s, ym) for ym, s in zip(out["ym"], src_sat)]

    out["harmonized"] = out["raw_snpp"]
    out["lo"] = out["raw_snpp"]
    out["hi"] = out["raw_snpp"]
    for name, src, link in (("terra-translated", "terra", "terra_snpp"), ("aqua-translated", "aqua", "aqua_snpp"),
                            ("noaa20-translated", "noaa20", "noaa20_snpp")):
        sel = (out["source"] == name).to_numpy()
        if sel.any():
            point, lo, hi = translate(links[link], cfg, region_id, link, unit,
                                      out.loc[sel, f"raw_{src}"].to_numpy(float), season[sel], rng)
            out.loc[sel, "harmonized"], out.loc[sel, "lo"], out.loc[sel, "hi"] = point, lo, hi
    assert out["harmonized"].notna().all(), "harmonized series has gaps"
    return out.drop(columns=["month"])


def allocate_cells(cells: pd.DataFrame, hm: pd.DataFrame) -> pd.DataFrame:
    """Share each month's regional value out to 0.25° cells. Cells always sum to the region.

    cells: sat, ym, ix, iy, fire_days. hm: ym, source, partial, harmonized.
    """
    cells = cells.copy()
    cells["cell"] = list(zip(cells["ix"], cells["iy"]))
    measured = set(hm.loc[(hm["source"] == "snpp") & ~hm["partial"], "ym"])
    snpp = cells[(cells["sat"] == "snpp") & cells["ym"].isin(measured)].copy()
    snpp["month"] = snpp["ym"].str[5:].astype(int)
    clim_month = {m: g.groupby("cell")["fire_days"].sum() for m, g in snpp.groupby("month")}
    clim_all = snpp.groupby("cell")["fire_days"].sum()
    by_sat_ym = {k: g.set_index("cell")["fire_days"] for k, g in cells.groupby(["sat", "ym"])}

    rows = []
    for r in hm.itertuples():
        if r.harmonized <= 0:
            continue
        own = by_sat_ym.get((SOURCE_SAT[r.source], r.ym))
        own = own / own.sum() if own is not None and own.sum() > 0 else None
        clim = clim_month.get(int(r.ym[5:]))
        clim = clim / clim.sum() if clim is not None and clim.sum() > 0 else clim_all / clim_all.sum()
        if r.source == "snpp" and own is not None:
            w = own
        elif own is None:
            w = clim
        else:
            w = (SOURCE_SHARE_WEIGHT * own).add((1 - SOURCE_SHARE_WEIGHT) * clim, fill_value=0.0)
        v = w * r.harmonized
        assert abs(v.sum() - r.harmonized) < 1e-6 * max(1.0, r.harmonized), f"{r.ym}: cells do not sum to region"
        rows.append(pd.DataFrame({"ym": r.ym, "ix": [c[0] for c in v.index], "iy": [c[1] for c in v.index],
                                  "value": v.to_numpy()}))
    return pd.concat(rows, ignore_index=True)


def calibrate_region(cfg: dict, region_id: str) -> None:
    unit = cfg.get("unit", "fire_days")
    rng = np.random.default_rng(int(cfg["random_seed"]))
    links = {name: fit_link(cfg, region_id, name, unit, rng) for name in ("aqua_snpp", "noaa20_snpp", "terra_snpp")}
    hm = build_monthly(cfg, region_id, links, unit, rng)
    cells = allocate_cells(pd.read_parquet(DATA / "agg" / region_id / "cellmonthly.parquet"), hm)
    out = DATA / "harmonized" / region_id
    out.mkdir(parents=True, exist_ok=True)
    hm.to_parquet(out / "monthly.parquet", index=False)
    cells.to_parquet(out / "cellmonthly.parquet", index=False)
    write_json(DATA / "model" / f"{region_id}.json", {"region": region_id, "unit": unit, "links": links})
    for name, link in links.items():
        ladder = ", ".join(f"{r['model']} {r['medApe']:.3f}" for r in link["ladder"] if r["medApe"] is not None)
        print(f"[calibrate] {region_id} {name}: chose {link['model']} | LOYO medAPE: {ladder} | "
              f"coverage {link['coverage90']:.0%} | exchange ×{link['exchange']['rate']:.2f} "
              f"({link['exchange']['lo']:.2f}–{link['exchange']['hi']:.2f})", flush=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--region")
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()
    cfg = load_config()
    for rid in region_ids(cfg, args.region, args.all, "agg/{region}/monthly.parquet"):
        calibrate_region(cfg, rid)


if __name__ == "__main__":
    main()
