"""Local solar time. One afternoon and the night after it share a date everywhere."""
from __future__ import annotations

import numpy as np
import pandas as pd


def local_solar(ts_utc: pd.Series, lon: pd.Series) -> tuple[pd.Series, pd.Series]:
    """Return (date_local, lst_hour) for UTC timestamps at the given longitudes.

    lst = utc + longitude/15 hours. date_local is the calendar date of lst;
    lst_hour is the fractional hour of day in [0, 24).
    """
    lst = ts_utc + pd.to_timedelta(lon.to_numpy() / 15.0, unit="h")
    date_local = lst.dt.floor("D")
    lst_hour = (lst - date_local) / np.timedelta64(1, "h")
    return date_local, lst_hour.astype("float32")
