"""Pettitt (1979) change-point test, implemented directly."""
from __future__ import annotations

import math

import numpy as np


def pettitt(x: np.ndarray) -> tuple[int, float]:
    """Return (index of the first point after the most likely change, approximate p-value)."""
    n = len(x)
    ranks = np.argsort(np.argsort(x, kind="stable"), kind="stable") + 1.0
    # U_t = 2 * sum(ranks[:t]) - t(n+1)
    t = np.arange(1, n + 1)
    u = 2 * np.cumsum(ranks) - t * (n + 1)
    k = int(np.argmax(np.abs(u[:-1])))
    p = 2.0 * math.exp(-6.0 * float(u[k]) ** 2 / (n ** 3 + n ** 2))
    return k + 1, float(min(1.0, p))
