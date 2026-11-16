"""Stage 9: a forecast for the month after the current one, kept only if it beats the seasonal normal.

Quantile gradient boosting on the harmonized record. Features at an origin month t: the target's
calendar month, its climatology (median of the same month in earlier years only), and the anomalies
of months t, t-1 and t-2. The target is month t+2, because month t+1 is the month in progress.
A rolling-origin backtest over 2016-2025 compares it with climatology and with persistence.
"""
from __future__ import annotations

import argparse

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor

from calibrate import COVERAGE_TARGET as COVERAGE_FLOOR
from lib import models
from lib.io import DATA, load_config, region_ids, write_json

HORIZON = 2
LAGS = 3
BACKTEST = (2016, 2025)
QUANTILES = {"lo": 0.05, "mid": 0.5, "hi": 0.95}


def frame(hm: pd.DataFrame) -> pd.DataFrame:
    """One row per month with log values, past-only climatology and anomaly. Partial months stay as gaps."""
    d = hm[["ym", "harmonized", "partial"]].copy()
    d["month"] = d["ym"].str[5:].astype(int)
    d["y"] = np.where(d["partial"], np.nan, np.log1p(d["harmonized"].to_numpy(float)))
    d["clim"] = d.groupby("month")["y"].transform(lambda s: s.shift(1).expanding().median())
    d["anom"] = d["y"] - d["clim"]
    return d.reset_index(drop=True)


def examples(d: pd.DataFrame) -> pd.DataFrame:
    """Rows of (origin, target) pairs with their features."""
    rows = []
    for t in range(LAGS - 1, len(d) - HORIZON):
        target = d.iloc[t + HORIZON]
        lags = d["anom"].iloc[t - LAGS + 1:t + 1].to_numpy()[::-1]
        rows.append({"origin": d["ym"].iloc[t], "ym": target["ym"], "month": target["month"],
                     "clim": target["clim"], **{f"a{i}": lags[i] for i in range(LAGS)}, "y": target["y"]})
    return pd.DataFrame(rows)


def features(e: pd.DataFrame) -> np.ndarray:
    angle = 2 * np.pi * (e["month"].to_numpy() - 1) / 12
    cols = [np.sin(angle), np.cos(angle), e["clim"].to_numpy()] + [e[f"a{i}"].to_numpy() for i in range(LAGS)]
    return np.column_stack(cols)


def fit_predict(train: pd.DataFrame, test: pd.DataFrame, seed: int) -> dict[str, np.ndarray]:
    out = {}
    for name, q in QUANTILES.items():
        model = GradientBoostingRegressor(loss="quantile", alpha=q, n_estimators=150, max_depth=2,
                                          learning_rate=0.05, subsample=0.8, random_state=seed)
        model.fit(features(train), train["y"].to_numpy())
        out[name] = model.predict(features(test))
    out["lo"] = np.minimum(out["lo"], out["mid"])
    out["hi"] = np.maximum(out["hi"], out["mid"])
    return out


def error(pred: np.ndarray, y: np.ndarray) -> float:
    """Median absolute percentage error on the count scale."""
    actual, guess = np.expm1(y), np.expm1(pred)
    ok = actual > 0
    return float(np.median(np.abs(guess[ok] - actual[ok]) / actual[ok]))


def forecast_region(cfg: dict, region_id: str) -> None:
    hm = pd.read_parquet(DATA / "harmonized" / region_id / "monthly.parquet")
    e = examples(frame(hm))
    usable = e.dropna()
    seed = int(cfg["random_seed"])

    tests = usable[usable["ym"].str[:4].astype(int).between(*BACKTEST)]
    preds = []
    # Refit once a year on every pair whose target was already seen when the year began.
    for year, rows in tests.groupby(tests["origin"].str[:4], sort=True):
        train = usable[usable["ym"] < f"{year}-01"]
        p = fit_predict(train, rows, seed)
        preds.append(pd.DataFrame({"ym": rows["ym"].to_numpy(), "y": rows["y"].to_numpy(), "clim": rows["clim"].to_numpy(),
                                   "persist": (rows["clim"] + rows["a0"]).to_numpy(), **p}))
    bt = pd.concat(preds, ignore_index=True)
    counts = {k: np.expm1(bt[k].to_numpy()) for k in ("mid", "lo", "hi", "y")}
    inside = lambda lo, hi: float(((counts["y"] >= lo) & (counts["y"] <= hi)).mean())
    coverage_raw = inside(counts["lo"], counts["hi"])
    scale = 1.0
    if coverage_raw < COVERAGE_FLOOR:
        scale = models.conformal_scale(counts["mid"], counts["lo"], counts["hi"], counts["y"])
    skill = {
        "backtest": f"{bt['ym'].min()}..{bt['ym'].max()}", "months": int(len(bt)),
        "model": error(bt["mid"], bt["y"]), "climatology": error(bt["clim"], bt["y"]),
        "persistence": error(bt["persist"], bt["y"]),
        "coverage90Raw": coverage_raw, "intervalScale": scale,
        "coverage90": inside(*models.widen(counts["mid"], counts["lo"], counts["hi"], scale)),
    }
    shown = skill["model"] < skill["climatology"] * (1 - models.COMPLEXITY_MARGIN)

    out = {"shown": shown, "horizonMonths": HORIZON, "skill": skill, "next": None}
    # The newest origin has no target yet; build the row for the month after the one in progress.
    d = frame(hm)
    last_full = d.dropna(subset=["anom"]).index.max()
    if last_full >= LAGS - 1 and last_full == len(d) - HORIZON:
        target_ym = (pd.Period(d["ym"].iloc[last_full], "M") + HORIZON).strftime("%Y-%m")
        month = int(target_ym[5:])
        past = d.loc[d["month"] == month, "y"].dropna()
        lags = d["anom"].iloc[last_full - LAGS + 1:last_full + 1].to_numpy()[::-1]
        latest = pd.DataFrame([{"month": month, "clim": float(past.median()), **{f"a{i}": lags[i] for i in range(LAGS)}}])
        p = {k: np.expm1(v) for k, v in fit_predict(usable, latest, seed).items()}
        lo, hi = models.widen(p["mid"], p["lo"], p["hi"], scale)
        out["next"] = {"ym": target_ym, "from": d["ym"].iloc[last_full], "value": float(p["mid"][0]),
                       "lo": float(lo[0]), "hi": float(hi[0]), "normal": float(np.expm1(latest["clim"].iloc[0]))}
    write_json(DATA / "forecast" / f"{region_id}.json", out)
    print(f"[forecast] {region_id}: error {skill['model']:.1%} vs climatology {skill['climatology']:.1%}, "
          f"persistence {skill['persistence']:.1%}; coverage {skill['coverage90Raw']:.0%} widened ×{scale:.2f} to "
          f"{skill['coverage90']:.0%}; shown {shown}"
          + (f"; {out['next']['ym']}: {out['next']['value']:.0f}" if out["next"] else ""), flush=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--region")
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()
    cfg = load_config()
    for rid in region_ids(cfg, args.region, args.all, "harmonized/{region}/monthly.parquet"):
        forecast_region(cfg, rid)


if __name__ == "__main__":
    main()
