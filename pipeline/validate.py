"""Stage 6: every check the Evidence view shows. Results are reported whatever they are."""
from __future__ import annotations

import argparse

import numpy as np
import pandas as pd

from calibrate import FIRST_SNPP_MONTH, link_windows, load_monthly, overlap_frame, pooled, wide
from lib import models
from lib.io import DATA, load_config, read_json, region_ids, write_json
from lib.pettitt import pettitt
from lib.stats import deseasonalize, step_test

UNITS = [("fire-days 0.1°", "fd_010", 0.1), ("fire-days 0.25°", "fire_days", 0.25), ("fire-days 0.5°", "fd_050", 0.5),
         ("day-only fire-days 0.25°", "fire_days_dayonly", None), ("pixels", "pixels", None)]
MIN_COUNT_FOR_RATIO = 5
MIN_DETECTIONS_FOR_LST = 20


def split_test(d: pd.DataFrame, pool: pd.DataFrame, rung: str, train: tuple[int, int], test: tuple[int, int],
               iterations: int, scale: float, rng: np.random.Generator) -> dict:
    tr = d[d["year"].between(*train)]
    te = d[d["year"].between(*test)]
    p = pool[pool["year"].between(*train)]
    pred = models.predict(models.fit(rung, tr, p), te["m"], te["season"])
    lo, hi = models.interval(rung, tr, p, te["m"], te["season"], iterations, rng)
    lo, hi = np.minimum(lo, pred), np.maximum(hi, pred)
    if scale != 1.0:
        lo, hi = models.widen(pred, lo, hi, scale)
    inside = (te["v"].to_numpy() >= lo - 1e-9) & (te["v"].to_numpy() <= hi + 1e-9)
    points = [{"ym": ym, "pred": float(a), "lo": float(b), "hi": float(c), "actual": float(v), "source": float(m)}
              for ym, a, b, c, v, m in zip(te["ym"], pred, lo, hi, te["v"], te["m"])]
    return {"train": f"{train[0]}-{train[1]}", "test": f"{test[0]}-{test[1]}", "points": points,
            **models.metrics(pred, te["v"]), "coverage90": float(inside.mean())}


def seam_tests(hm: pd.DataFrame, notes: list[str]) -> dict:
    s = hm[~hm["partial"]].reset_index(drop=True)
    raw = np.where(s["source"] == "aqua-translated", s["raw_aqua"],
                   np.where(s["source"] == "snpp", s["raw_snpp"], s["raw_noaa20"])).astype(float)
    month = s["ym"].str[5:].astype(int).to_numpy()
    y_raw, y_h = np.log1p(raw), np.log1p(s["harmonized"].to_numpy(float))
    out = {}
    at = int((s["ym"] >= FIRST_SNPP_MONTH).to_numpy().argmax())
    out[FIRST_SNPP_MONTH] = {"raw": step_test(y_raw, month, at), "harmonized": step_test(y_h, month, at)}
    after = s[s["source"] == "noaa20-translated"]
    if len(after) >= 1:
        at2 = int(after.index[0])
        out[after["ym"].iloc[0]] = {"raw": step_test(y_raw, month, at2), "harmonized": step_test(y_h, month, at2)}
    else:
        notes.append("The NOAA-20 handoff seam cannot be step-tested yet: no full month of NOAA-20-only data exists. "
                     "The handoff is checked on the 2020–2026 overlap instead (see the handoff figure).")
    pett = {}
    # Aqua alone is one instrument for the whole record: a change point it also shows is real burning, not a seam.
    for name, y in (("raw", y_raw), ("harmonized", y_h), ("aquaOnly", np.log1p(s["raw_aqua"].to_numpy(float)))):
        k, p = pettitt(deseasonalize(y, month))
        pett[name] = {"ym": s["ym"].iloc[k], "p": p}
    out["pettitt"] = pett
    if pett["harmonized"]["p"] < 0.05:
        months = lambda ym: int(ym[:4]) * 12 + int(ym[5:])
        apart = abs(months(pett["harmonized"]["ym"]) - months(pett["aquaOnly"]["ym"]))
        if pett["aquaOnly"]["p"] >= 0.05:
            verdict = "Aqua alone does not show one, so a leftover seam cannot be ruled out."
        elif apart <= 12:
            verdict = (f"Aqua alone, one instrument throughout, shows one too ({pett['aquaOnly']['ym']}), so this is a change "
                       "in burning rather than a satellite seam.")
        else:
            verdict = (f"Aqua alone, one instrument throughout, puts its change point at {pett['aquaOnly']['ym']}, a different "
                       "date, so the single-instrument check neither confirms nor rules out a leftover seam.")
        notes.append(f"Pettitt's test still finds a change point in the harmonized series ({pett['harmonized']['ym']}). {verdict}")
    notes.append("Seam step intervals treat the translated values as fixed; they do not include translation uncertainty.")
    return out


def unit_stability(cfg: dict, region_id: str, unit_in_use: str, notes: list[str]) -> list[dict]:
    monthly = load_monthly(region_id)
    src, tgt, first, last = link_windows(cfg, region_id)["aqua_snpp"]
    snpp = monthly[(monthly["sat"] == "snpp") & monthly["complete"]]
    peak = snpp.loc[snpp["fire_days"].idxmax()]
    rows = []
    for label, col, g in UNITS:
        w = wide(monthly, col).loc[first:last, [src, tgt]].dropna()
        w = w[(w[src] >= MIN_COUNT_FOR_RATIO) & (w[tgt] >= MIN_COUNT_FOR_RATIO)]
        sd = float(np.log(w[tgt] / w[src]).std(ddof=1)) if len(w) >= 12 else None
        sat = None
        if g is not None:
            fd = pd.read_parquet(DATA / "grid" / region_id / f"firedays_{g}.parquet")
            fd = fd[(fd["sat"] == "snpp") & (fd["date_local"].dt.strftime("%Y-%m") == peak["ym"])]
            cells = len(fd[["ix", "iy"]].drop_duplicates())
            sat = float(len(fd) / (cells * peak["days_in_month"])) if cells else None
        rows.append({"unit": label, "column": col, "cv": None if sd is None else float(np.sqrt(np.expm1(sd ** 2))),
                     "sdLog": sd, "months": int(len(w)), "saturation": sat, "chosen": col == unit_in_use})
    scored = [r for r in rows if r["cv"] is not None]
    if scored:
        best = min(scored, key=lambda r: r["cv"])
        for r in rows:
            r["steadiest"] = r is best
        used = next(r for r in rows if r["chosen"])
        if best is not used and used["cv"] is not None:
            notes.append(f"Unit check: {best['unit']} gave the steadiest monthly exchange rate "
                         f"(CV {best['cv']:.2f}) versus {used['cv']:.2f} for {used['unit']}, the unit in use.")
    return rows


def measured_drift(region_id: str, notes: list[str]) -> tuple[list[dict], dict]:
    lst = {}
    for sat in ["aqua", "terra", "snpp", "noaa20"]:
        f = DATA / "clean" / region_id / f"{sat}.parquet"
        if not f.exists():
            continue
        d = pd.read_parquet(f, columns=["date_local", "lst_hour", "daynight"])
        d = d[d["daynight"] == "D"]
        g = d.groupby(d["date_local"].dt.year)["lst_hour"]
        q = g.quantile([0.25, 0.5, 0.75]).unstack()
        q["n"] = g.size()
        lst[sat] = q[q["n"] >= MIN_DETECTIONS_FOR_LST]
    w = wide(load_monthly(region_id), "fire_days")
    both = w[["aqua", "snpp"]].dropna()
    annual = both.groupby(both.index.str[:4].astype(int)).agg(["sum", "count"])
    rows = []
    for year in range(2002, int(w.index.max()[:4]) + 1):
        row = {"year": year}
        for sat in ["aqua", "terra", "snpp", "noaa20"]:
            has = sat in lst and year in lst[sat].index
            row[f"{sat}Lst"] = float(lst[sat].at[year, 0.5]) if has else None
            row[f"{sat}LstIqr"] = [float(lst[sat].at[year, 0.25]), float(lst[sat].at[year, 0.75])] if has else None
        ok = year in annual.index and annual.at[year, ("aqua", "count")] >= 10 and annual.at[year, ("aqua", "sum")] > 0
        row["ratio"] = float(annual.at[year, ("snpp", "sum")] / annual.at[year, ("aqua", "sum")]) if ok else None
        rows.append(row)

    base = [r for r in rows if 2012 <= r["year"] <= 2020 and r["ratio"] and r["aquaLst"]]
    late = [r for r in rows if r["year"] >= 2022 and r["ratio"] and r["aquaLst"]]
    effect = {"detected": None}
    if len(base) >= 5 and late:
        b_ratio = np.array([r["ratio"] for r in base])
        shift = (np.mean([r["aquaLst"] for r in late]) - np.mean([r["aquaLst"] for r in base])) * 60
        latest_shift = (late[-1]["aquaLst"] - np.mean([r["aquaLst"] for r in base])) * 60
        l_ratio = np.array([r["ratio"] for r in late])
        lo, hi = b_ratio.mean() - 2 * b_ratio.std(ddof=1), b_ratio.mean() + 2 * b_ratio.std(ddof=1)
        outside = int(((l_ratio < lo) | (l_ratio > hi)).sum())
        detected = bool(abs(shift) >= 10 and outside > len(l_ratio) / 2)
        effect = {"detected": detected, "baselineRatio": float(b_ratio.mean()), "baselineSd": float(b_ratio.std(ddof=1)),
                  "lateRatio": float(l_ratio.mean()), "lateYearsOutside": outside, "lateYears": int(len(l_ratio)),
                  "aquaShiftMinutes": float(shift), "aquaLatestShiftMinutes": float(latest_shift)}
        if detected:
            notes.append(f"Drift: Aqua's measured daytime overpass moved {shift:+.0f} min on average after 2021 and the "
                         f"S-NPP/Aqua ratio left its 2012–2020 range in {outside} of {len(l_ratio)} years.")
        else:
            notes.append(f"Drift: Aqua's measured daytime overpass moved {shift:+.0f} min on average after 2021 "
                         f"({latest_shift:+.0f} min in the latest year), but the S-NPP/Aqua fire-day ratio stayed inside its "
                         f"2012–2020 range in {len(l_ratio) - outside} of {len(l_ratio)} years: no clear effect detected.")
    return rows, effect


def handoff(cfg: dict, region_id: str, link2: dict, unit: str) -> dict:
    src, tgt, first, last = link_windows(cfg, region_id)["noaa20_snpp"]
    d = overlap_frame(region_id, src, tgt, first, last, unit)
    out = {"factor": link2["factor"]["value"], "lo": link2["factor"]["lo"], "hi": link2["factor"]["hi"],
           "model": link2["model"], "fit": link2["fit"],
           "points": [{"ym": ym, "noaa20": float(m), "snpp": float(v)} for ym, m, v in zip(d["ym"], d["m"], d["v"])]}
    w = wide(load_monthly(region_id), unit)
    if "noaa21" in w:
        both = w[["noaa20", "noaa21"]].dropna()
        if len(both) and both["noaa20"].sum() > 0:
            out["noaa21"] = {"months": f"{both.index.min()}..{both.index.max()}",
                             "ratioToNoaa20": float(both["noaa21"].sum() / both["noaa20"].sum())}
    return out


def validate_region(cfg: dict, region_id: str) -> dict:
    model = read_json(DATA / "model" / f"{region_id}.json")
    unit = model["unit"]
    l1, l2 = model["links"]["aqua_snpp"], model["links"]["noaa20_snpp"]
    hm = pd.read_parquet(DATA / "harmonized" / region_id / "monthly.parquet")
    rng = np.random.default_rng(int(cfg["random_seed"]) + 1)
    B = int(cfg["bootstrap_iterations"])
    notes = list(l1["notes"]) + list(l2["notes"])

    src, tgt, first, last = link_windows(cfg, region_id)["aqua_snpp"]
    d = overlap_frame(region_id, src, tgt, first, last, unit)
    pool = pooled(cfg, "aqua_snpp", unit)
    rung = l1["model"]
    y0, y1 = cfg["calibration_years"]
    forward = split_test(d, pool, rung, (y0, y1 - 3), (y1 - 2, y1), B, l1["intervalScale"], rng)
    backward = split_test(d, pool, rung, (y0 + 4, y1), (y0, y0 + 3), B, l1["intervalScale"], rng)

    full = hm[~hm["partial"]].copy()
    full["year"] = full["ym"].str[:4].astype(int)
    years = full.groupby("year").agg(total=("harmonized", "sum"), n=("ym", "size"))
    top = years[years["n"] == 12].sort_values("total", ascending=False).head(5)
    if hm["partial"].iloc[0]:
        notes.append(f"{hm['ym'].iloc[0]} is incomplete: Aqua's fire record begins on 4 July 2002.")
    if cfg.get("unit", "fire_days") != "fire_days":
        notes.append(f"The app's unit was switched to {unit} after the unit check.")

    drift, effect = measured_drift(region_id, notes)
    out = {
        "region": region_id, "unit": unit,
        "ladder": l1["ladder"], "ladderLink2": l2["ladder"],
        "forward": forward, "backward": backward,
        "coverage90": l1["coverage90"], "coverage90Raw": l1["coverage90Raw"], "intervalScale": l1["intervalScale"],
        "coverage90Link2": l2["coverage90"], "coverage90Link2Raw": l2["coverage90Raw"],
        "seams": seam_tests(hm, notes),
        "units": unit_stability(cfg, region_id, unit, notes),
        "drift": drift, "driftEffect": effect,
        "handoff": handoff(cfg, region_id, l2, unit),
        "exchange": l1["exchange"],
        "topYears": [{"year": int(y), "total": float(t)} for y, t in top["total"].items()],
        "pooledRegions": l1["pooledRegions"],
        "notes": notes,
    }
    write_json(DATA / "validation" / f"{region_id}.json", out)
    return out


def summary(v: dict) -> str:
    def fmt(rows):
        return ", ".join(f"{r['model']}{'*' if r['chosen'] else ''} {r['medApe']:.1%}" for r in rows if r["medApe"] is not None)
    seam = v["seams"][FIRST_SNPP_MONTH]
    used = next(u for u in v["units"] if u["chosen"])
    lines = [
        f"== {v['region']} ({v['unit']}) ==",
        f"link 1 LOYO medAPE: {fmt(v['ladder'])}",
        f"link 2 LOYO medAPE: {fmt(v['ladderLink2'])}",
        f"exchange rate Aqua->S-NPP: x{v['exchange']['rate']:.2f} ({v['exchange']['lo']:.2f}-{v['exchange']['hi']:.2f}) "
        f"at {v['exchange']['atSourceCount']:.0f} Aqua fire-days",
        f"backward test (fit {v['backward']['train']}, predict {v['backward']['test']}): medAPE {v['backward']['medApe']:.1%}, "
        f"bias {v['backward']['bias']:+.1%}, coverage {v['backward']['coverage90']:.0%}",
        f"forward test: medAPE {v['forward']['medApe']:.1%}, bias {v['forward']['bias']:+.1%}, coverage {v['forward']['coverage90']:.0%}",
        f"LOYO 90% coverage: link 1 {v['coverage90']:.0%} (raw {v['coverage90Raw']:.0%}, scale x{v['intervalScale']:.2f}); "
        f"link 2 {v['coverage90Link2']:.0%} (raw {v['coverage90Link2Raw']:.0%})",
        f"step at 2012-02 (log): raw {seam['raw']['step']:+.2f} [{seam['raw']['lo']:+.2f}, {seam['raw']['hi']:+.2f}] "
        f"= x{np.exp(seam['raw']['step']):.2f}; harmonized {seam['harmonized']['step']:+.2f} "
        f"[{seam['harmonized']['lo']:+.2f}, {seam['harmonized']['hi']:+.2f}] = x{np.exp(seam['harmonized']['step']):.2f}",
        f"Pettitt: raw {v['seams']['pettitt']['raw']['ym']} p={v['seams']['pettitt']['raw']['p']:.2g}; "
        f"harmonized {v['seams']['pettitt']['harmonized']['ym']} p={v['seams']['pettitt']['harmonized']['p']:.2g}; "
        f"Aqua only {v['seams']['pettitt']['aquaOnly']['ym']} p={v['seams']['pettitt']['aquaOnly']['p']:.2g}",
        "units (CV of monthly exchange rate; saturation in peak month): " + "; ".join(
            f"{u['unit']}{'*' if u['chosen'] else ''} {u['cv']:.2f}" + (f"/{u['saturation']:.0%}" if u["saturation"] is not None else "")
            for u in v["units"] if u["cv"] is not None),
        f"unit in use: {used['unit']}",
        f"handoff NOAA-20->S-NPP: factor {v['handoff']['factor']:.3f} ({v['handoff']['lo']:.3f}-{v['handoff']['hi']:.3f}), "
        f"model {v['handoff']['model']}; NOAA-21/NOAA-20 {v['handoff'].get('noaa21', {}).get('ratioToNoaa20')}",
        "Aqua daytime overpass (local solar h): " + " ".join(
            f"{r['year']}:{r['aquaLst']:.2f}" for r in v["drift"] if r["aquaLst"] is not None),
        "S-NPP/Aqua annual ratio: " + " ".join(f"{r['year']}:{r['ratio']:.2f}" for r in v["drift"] if r["ratio"] is not None),
        "top fire years: " + ", ".join(f"{t['year']} ({t['total']:.0f})" for t in v["topYears"]),
        "notes:", *[f"  - {n}" for n in v["notes"]],
    ]
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--region")
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()
    cfg = load_config()
    for rid in region_ids(cfg, args.region, args.all, "model/{region}.json"):
        print(summary(validate_region(cfg, rid)), flush=True)


if __name__ == "__main__":
    main()
