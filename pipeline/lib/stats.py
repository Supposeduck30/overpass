"""Small statistics used by validation and the season clock. numpy only."""
from __future__ import annotations

import math

import numpy as np

Z95 = 1.959964


def norm_sf(z: float) -> float:
    return 0.5 * math.erfc(z / math.sqrt(2))


def ols_hac(X: np.ndarray, y: np.ndarray, lags: int | None = None) -> tuple[np.ndarray, np.ndarray]:
    """OLS coefficients with Newey-West (Bartlett kernel) standard errors."""
    n, k = X.shape
    beta, *_ = np.linalg.lstsq(X, y, rcond=None)
    u = y - X @ beta
    if lags is None:
        lags = int(math.floor(4 * (n / 100.0) ** (2.0 / 9.0)))
    xu = X * u[:, None]
    s = xu.T @ xu
    for lag in range(1, lags + 1):
        w = 1.0 - lag / (lags + 1.0)
        g = xu[lag:].T @ xu[:-lag]
        s += w * (g + g.T)
    bread = np.linalg.pinv(X.T @ X)
    cov = bread @ s @ bread * n / max(n - k, 1)
    return beta, np.sqrt(np.maximum(np.diag(cov), 0.0))


def step_test(y: np.ndarray, month: np.ndarray, step_at: int) -> dict:
    """Step at index `step_at` in a monthly series, net of month-of-year means and a linear trend.

    y is on the log scale, so exp(step) is the multiplicative jump.
    """
    n = len(y)
    t = np.arange(n, dtype=float)
    cols = [np.ones(n), t / 120.0, (t >= step_at).astype(float)]
    cols += [(month == mth).astype(float) for mth in range(2, 13)]
    X = np.column_stack(cols)
    beta, se = ols_hac(X, y)
    return {"step": float(beta[2]), "lo": float(beta[2] - Z95 * se[2]), "hi": float(beta[2] + Z95 * se[2])}


def deseasonalize(y: np.ndarray, month: np.ndarray) -> np.ndarray:
    out = y.astype(float).copy()
    for mth in range(1, 13):
        sel = month == mth
        if sel.any():
            out[sel] -= out[sel].mean()
    return out


def mann_kendall(y: np.ndarray) -> float:
    """Two-sided Mann-Kendall p-value (normal approximation, no tie correction)."""
    n = len(y)
    if n < 4:
        return 1.0
    s = sum(np.sign(y[j] - y[i]) for i in range(n - 1) for j in range(i + 1, n))
    var = n * (n - 1) * (2 * n + 5) / 18.0
    z = (s - np.sign(s)) / math.sqrt(var) if s != 0 else 0.0
    return float(min(1.0, 2 * norm_sf(abs(z))))


def theil_sen(x: np.ndarray, y: np.ndarray) -> tuple[float, float, float]:
    """Median pairwise slope with Sen's 95% confidence interval."""
    n = len(x)
    slopes = np.sort([(y[j] - y[i]) / (x[j] - x[i]) for i in range(n - 1) for j in range(i + 1, n) if x[j] != x[i]])
    if len(slopes) == 0:
        return 0.0, 0.0, 0.0
    c = Z95 * math.sqrt(n * (n - 1) * (2 * n + 5) / 18.0)
    lo_i = int(max(0, math.floor((len(slopes) - c) / 2.0)))
    hi_i = int(min(len(slopes) - 1, math.ceil((len(slopes) + c) / 2.0)))
    return float(np.median(slopes)), float(slopes[lo_i]), float(slopes[hi_i])
