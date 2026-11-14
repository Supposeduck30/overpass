"""Fire years and season timing."""
from __future__ import annotations

import numpy as np
import pandas as pd


def fire_year(dates: pd.Series, start_month: int) -> pd.Series:
    """Fire year label = calendar year in which the fire year begins."""
    return dates.dt.year - (dates.dt.month < start_month).astype(int)


def day_of_fire_year(dates: pd.Series, start_month: int) -> pd.Series:
    """1-based day counted from the first day of the fire year."""
    fy = fire_year(dates, start_month)
    start = pd.to_datetime({"year": fy, "month": start_month, "day": 1})
    return (dates - start).dt.days + 1


def season_marks(daily: np.ndarray) -> dict | None:
    """Days (1-based) on which the cumulative count reaches 10%, 50% and 90% of the total.

    A constant scale factor leaves these unchanged, so each era can use its own satellite.
    """
    total = float(np.sum(daily))
    if total <= 0:
        return None
    cum = np.cumsum(daily) / total
    onset, peak, end = (int(np.searchsorted(cum, q - 1e-12) + 1) for q in (0.10, 0.50, 0.90))
    return {"onset": onset, "peak": peak, "end": end, "total": total}
