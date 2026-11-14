"""Grid cells and fire-days. web/src/lib/grid.ts mirrors cell_index and is tested on the same fixture."""
from __future__ import annotations

import numpy as np
import pandas as pd


def cell_index(lat, lon, g: float):
    """(ix, iy) of the g-degree cell holding each point; ix counts east from 180°W, iy north from 90°S."""
    ix = np.floor((np.asarray(lon, float) + 180.0) / g).astype("int32")
    iy = np.floor((np.asarray(lat, float) + 90.0) / g).astype("int32")
    return ix, iy


def cell_center(ix, iy, g: float):
    return (np.asarray(iy) + 0.5) * g - 90.0, (np.asarray(ix) + 0.5) * g - 180.0


def fire_days(df: pd.DataFrame, g: float) -> pd.DataFrame:
    """One row per satellite, cell and local date with at least one qualifying detection."""
    ix, iy = cell_index(df["lat"], df["lon"], g)
    d = pd.DataFrame({
        "sat": df["sat"].to_numpy(), "ix": ix, "iy": iy, "date_local": df["date_local"].to_numpy(),
        "frp": df["frp"].to_numpy(), "is_day": (df["daynight"] == "D").to_numpy(),
    })
    out = d.groupby(["sat", "ix", "iy", "date_local"], sort=True).agg(
        n_pixels=("frp", "size"), frp_sum=("frp", "sum"), n_day=("is_day", "sum")).reset_index()
    out["n_night"] = out["n_pixels"] - out["n_day"]
    return out
