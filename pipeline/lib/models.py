"""The model ladder that translates one satellite's monthly counts into another's.

Every function works on a "frame": a DataFrame with columns
year, month, m (source count), v (target count), season (bool: inside critical months).
`pool` is the same shape and holds the overlap months of every prepared region; it is
only used by M0, the global factor.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

RUNGS = ["M0", "M1", "M2", "M3", "M4"]
RUNG_LABELS = {
    "identity": "no adjustment",
    "M0": "one global factor",
    "M1": "regional factor",
    "M2": "regional factor per season",
    "M3": "log-linear",
    "M4": "quantile mapping",
}
MIN_V_FOR_APE = 5
COMPLEXITY_MARGIN = 0.05
PROMOTE_CONFIDENCE = 0.90


def _ratio(v: np.ndarray, m: np.ndarray) -> float:
    return float(v.sum() / m.sum()) if m.sum() > 0 else 1.0


def fit(rung: str, d: pd.DataFrame, pool: pd.DataFrame | None = None) -> dict:
    m, v = d["m"].to_numpy(float), d["v"].to_numpy(float)
    if rung == "identity":
        return {"model": "identity"}
    if rung == "M0":
        p = pool if pool is not None and len(pool) else d
        return {"model": "M0", "factor": _ratio(p["v"].to_numpy(float), p["m"].to_numpy(float))}
    if rung == "M1":
        return {"model": "M1", "factor": _ratio(v, m)}
    if rung == "M2":
        s = d["season"].to_numpy(bool)
        overall = _ratio(v, m)
        return {"model": "M2",
                "factorIn": _ratio(v[s], m[s]) if m[s].sum() > 0 else overall,
                "factorOut": _ratio(v[~s], m[~s]) if m[~s].sum() > 0 else overall}
    if rung == "M3":
        x, y = np.log1p(m), np.log1p(v)
        if len(x) < 3 or np.ptp(x) == 0:
            return {"model": "M3", "a": float(y.mean() - x.mean()), "b": 1.0, "smear": 1.0}
        b, a = np.polyfit(x, y, 1)
        smear = float(np.mean(np.exp(y - (a + b * x))))
        return {"model": "M3", "a": float(a), "b": float(b), "smear": smear}
    if rung == "M4":
        return {"model": "M4", "mq": np.sort(m).tolist(), "vq": np.sort(v).tolist()}
    raise ValueError(rung)


def predict(params: dict, m, season=None) -> np.ndarray:
    m = np.asarray(m, float)
    kind = params["model"]
    if kind == "identity":
        return m.copy()
    if kind in ("M0", "M1"):
        return params["factor"] * m
    if kind == "M2":
        s = np.asarray(season, bool)
        return np.where(s, params["factorIn"], params["factorOut"]) * m
    if kind == "M3":
        # Duan-smeared back-transform keeps the mean right; the floor keeps it physical.
        out = np.exp(params["a"] + params["b"] * np.log1p(m)) * params["smear"] - 1.0
        return np.maximum(out, 0.0)
    if kind == "M4":
        mq, vq = np.asarray(params["mq"]), np.asarray(params["vq"])
        out = np.interp(m, mq, vq)
        # Beyond the largest month seen in training, extend with the top-of-range ratio.
        top = m > mq[-1]
        if top.any() and mq[-1] > 0:
            out[top] = vq[-1] * m[top] / mq[-1]
        return out
    raise ValueError(kind)


def metrics(pred, actual) -> dict:
    pred, actual = np.asarray(pred, float), np.asarray(actual, float)
    big = actual >= MIN_V_FOR_APE
    lp, la = np.log1p(pred), np.log1p(actual)
    sst = float(((la - la.mean()) ** 2).sum())
    return {
        "medApe": float(np.median(np.abs(pred[big] - actual[big]) / actual[big])) if big.any() else None,
        "mae": float(np.mean(np.abs(pred - actual))),
        "r2log": float(1 - ((la - lp) ** 2).sum() / sst) if sst > 0 else None,
        "bias": float((pred.sum() - actual.sum()) / actual.sum()) if actual.sum() > 0 else None,
        "n": int(len(actual)),
    }


def _without_year(frame: pd.DataFrame | None, year: int):
    return None if frame is None else frame[frame["year"] != year]


def loyo(rung: str, d: pd.DataFrame, pool: pd.DataFrame | None = None) -> pd.DataFrame:
    """Leave-one-year-out predictions. Returns d plus a `pred` column."""
    out = d.copy()
    out["pred"] = np.nan
    for year in sorted(d["year"].unique()):
        test = d["year"] == year
        params = fit(rung, d[~test], _without_year(pool, year))
        out.loc[test, "pred"] = predict(params, d.loc[test, "m"], d.loc[test, "season"])
    return out


def ladder(d: pd.DataFrame, pool: pd.DataFrame | None = None, rungs=RUNGS) -> tuple[list[dict], dict]:
    """LOYO metrics per rung, plus each rung's held-out predictions (aligned with d)."""
    rows, preds = [], {}
    for rung in rungs:
        cv = loyo(rung, d, pool)
        preds[rung] = cv["pred"].to_numpy(float)
        rows.append({"model": rung, **metrics(cv["pred"], cv["v"])})
    return rows, preds


def _prob_better(pred_new, pred_old, actual, draws: int = 1000) -> float:
    """Share of month-resamples in which the new rung's median error is the smaller one."""
    actual = np.asarray(actual, float)
    big = actual >= MIN_V_FOR_APE
    e_new = np.abs(pred_new[big] - actual[big]) / actual[big]
    e_old = np.abs(pred_old[big] - actual[big]) / actual[big]
    rng = np.random.default_rng(0)
    idx = rng.integers(0, len(e_new), (draws, len(e_new)))
    return float(np.mean(np.median(e_new[idx], axis=1) < np.median(e_old[idx], axis=1)))


def select(rows: list[dict], preds: dict, actual) -> str:
    """Walk up the ladder. A more complex rung replaces the current choice only if its held-out
    median error is > 5% lower (relative) and stays lower in at least 90% of month-resamples,
    so a rung is not promoted on cross-validation noise."""
    usable = [r for r in rows if r["medApe"] is not None]
    if not usable:
        return rows[0]["model"]
    best = usable[0]
    for r in usable[1:]:
        if (r["medApe"] < best["medApe"] * (1 - COMPLEXITY_MARGIN)
                and _prob_better(preds[r["model"]], preds[best["model"]], actual) >= PROMOTE_CONFIDENCE):
            best = r
    return best["model"]


def _resample_years(frame: pd.DataFrame, years: np.ndarray) -> pd.DataFrame:
    groups = {y: g for y, g in frame.groupby("year")}
    return pd.concat([groups[y] for y in years if y in groups], ignore_index=True)


def interval(rung: str, d: pd.DataFrame, pool: pd.DataFrame | None, m_new, season_new,
             iterations: int, rng: np.random.Generator, q=(0.05, 0.95)) -> tuple[np.ndarray, np.ndarray]:
    """90% prediction interval: parameter uncertainty (year-block bootstrap) plus a residual.

    The residual is drawn on the log(1+x) scale from the training months whose source
    count is closest to the month being predicted, so quiet months borrow their spread
    from quiet months and busy months from busy ones.
    """
    m_new = np.asarray(m_new, float)
    season_new = np.asarray(season_new, bool)
    years = np.sort(d["year"].unique())
    draws = np.empty((iterations, len(m_new)))
    for b in range(iterations):
        pick = rng.choice(years, size=len(years), replace=True)
        train = _resample_years(d, pick)
        params = fit(rung, train, None if pool is None else _resample_years(pool, pick))
        resid = np.log1p(train["v"].to_numpy(float)) - np.log1p(predict(params, train["m"], train["season"]))
        x_train = np.log1p(train["m"].to_numpy(float))
        k = min(len(train), max(12, len(train) // 4))
        near = np.argpartition(np.abs(x_train[None, :] - np.log1p(m_new)[:, None]), k - 1, axis=1)[:, :k]
        e = resid[near[np.arange(len(m_new)), rng.integers(0, k, len(m_new))]]
        draws[b] = np.expm1(np.log1p(predict(params, m_new, season_new)) + e)
    lo, hi = np.quantile(draws, q, axis=0)
    return np.maximum(lo, 0.0), np.maximum(hi, 0.0)


def widen(point, lo, hi, scale: float) -> tuple[np.ndarray, np.ndarray]:
    """Stretch an interval about its point on the log(1+x) scale."""
    lp, ll, lh = np.log1p(point), np.log1p(lo), np.log1p(hi)
    return np.maximum(np.expm1(lp - (lp - ll) * scale), 0.0), np.expm1(lp + (lh - lp) * scale)


def conformal_scale(point, lo, hi, actual, target: float = 0.90) -> float:
    """Factor by which held-out intervals must stretch for `target` of truths to fall inside."""
    lp, ll, lh, la = (np.log1p(np.asarray(a, float)) for a in (point, lo, hi, actual))
    up = np.where(la > lp, (la - lp) / np.maximum(lh - lp, 1e-9), 0.0)
    down = np.where(la < lp, (lp - la) / np.maximum(lp - ll, 1e-9), 0.0)
    return float(np.quantile(np.maximum(up, down), target))


def loyo_interval(rung: str, d: pd.DataFrame, pool: pd.DataFrame | None, iterations: int,
                  rng: np.random.Generator) -> pd.DataFrame:
    """Held-out point predictions with intervals, for the coverage check."""
    out = d.copy()
    out[["pred", "lo", "hi"]] = np.nan
    for year in sorted(d["year"].unique()):
        test = d["year"] == year
        train, p = d[~test], _without_year(pool, year)
        params = fit(rung, train, p)
        pred = predict(params, d.loc[test, "m"], d.loc[test, "season"])
        lo, hi = interval(rung, train, p, d.loc[test, "m"], d.loc[test, "season"], iterations, rng)
        out.loc[test, "pred"] = pred
        out.loc[test, "lo"] = np.minimum(lo, pred)
        out.loc[test, "hi"] = np.maximum(hi, pred)
    return out


def coverage(frame: pd.DataFrame) -> float:
    inside = (frame["v"] >= frame["lo"] - 1e-9) & (frame["v"] <= frame["hi"] + 1e-9)
    return float(inside.mean())
