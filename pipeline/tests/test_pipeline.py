"""Synthetic-data tests for the method. No FIRMS data is read here."""
import json
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from calibrate import allocate_cells
from lib import models
from lib.gridding import cell_index, fire_days
from lib.pettitt import pettitt
from lib.season import day_of_fire_year, fire_year, season_marks
from lib.solar import local_solar
from lib.stats import deseasonalize, mann_kendall, step_test, theil_sen

FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "grid_cases.json").read_text(encoding="utf-8"))


def frame(m, v):
    n = len(m)
    month = np.arange(n) % 12 + 1
    return pd.DataFrame({"year": 2012 + np.arange(n) // 12, "month": month, "m": m, "v": v,
                         "season": np.isin(month, [8, 9, 10])})


def seasonal_counts(rng, years=9, peak=400):
    month = np.arange(years * 12) % 12
    base = peak * np.exp(-0.5 * ((month - 8) / 1.5) ** 2) + 3
    return np.round(base * rng.lognormal(0, 0.5, len(month)))


def test_factor_three_recovered_by_m1_and_m3():
    rng = np.random.default_rng(1)
    m = seasonal_counts(rng)
    d = frame(m, 3 * m)
    assert models.fit("M1", d)["factor"] == pytest.approx(3.0)
    pred = models.predict(models.fit("M3", d), [10, 100, 1000])
    assert pred == pytest.approx([30, 300, 3000], rel=0.08)


def test_loyo_picks_regional_factor_when_truth_is_a_factor():
    # Selection is a statistical rule, so it is tested over many synthetic records.
    picks = []
    for seed in range(20, 40):
        rng = np.random.default_rng(seed)
        m = seasonal_counts(rng)
        d = frame(m, 3 * m * rng.lognormal(0, 0.2, len(m)))
        pool = pd.concat([d, frame(m, 6 * m)])  # a second region with another factor moves the global one
        picks.append(models.select(*models.ladder(d, pool), d["v"]))
    assert picks.count("M1") >= 16


def test_loyo_picks_loglinear_when_truth_is_a_power_law():
    rng = np.random.default_rng(3)
    m = seasonal_counts(rng)
    v = np.round(12 * (m + 1) ** 0.6 * rng.lognormal(0, 0.05, len(m)))
    d = frame(m, v)
    assert models.select(*models.ladder(d, None), d["v"]) == "M3"


def test_m2_recovers_seasonal_factors():
    rng = np.random.default_rng(4)
    m = seasonal_counts(rng)
    d = frame(m, m)
    d["v"] = np.where(d["season"], 2.0, 5.0) * d["m"]
    p = models.fit("M2", d)
    assert (p["factorIn"], p["factorOut"]) == pytest.approx((2.0, 5.0))


def test_quantile_map_is_monotone_and_extends():
    rng = np.random.default_rng(5)
    m = seasonal_counts(rng)
    p = models.fit("M4", frame(m, 2 * m))
    pred = models.predict(p, [0, 5, 50, 500, m.max() * 2])
    assert np.all(np.diff(pred) >= 0)
    assert pred[-1] == pytest.approx(4 * m.max())


def test_interval_coverage_near_90_percent():
    rng = np.random.default_rng(6)
    m = seasonal_counts(rng, years=12)
    v = np.round(3 * m * rng.lognormal(0, 0.3, len(m)))
    cv = models.loyo_interval("M1", frame(m, v), None, 150, np.random.default_rng(7))
    assert 0.82 <= models.coverage(cv) <= 0.97


def test_conformal_scale_restores_coverage():
    rng = np.random.default_rng(8)
    actual = 100 * rng.lognormal(0, 0.4, 400)
    point = np.full(400, 100.0)
    lo, hi = point * 0.9, point * 1.1  # far too narrow
    scale = models.conformal_scale(point, lo, hi, actual)
    lo2, hi2 = models.widen(point, lo, hi, scale)
    assert np.mean((actual >= lo2) & (actual <= hi2)) == pytest.approx(0.90, abs=0.02)


def monthly_log_series(rng, n=288, step_at=None, step=0.0):
    month = np.arange(n) % 12 + 1
    y = 3 + 1.5 * np.sin(2 * np.pi * month / 12) + rng.normal(0, 0.3, n)
    if step_at is not None:
        y[step_at:] += step
    return y, month


def test_step_test_finds_injected_step():
    y, month = monthly_log_series(np.random.default_rng(9), step_at=115, step=1.0)
    r = step_test(y, month, 115)
    assert 0.5 < r["lo"] < 1.0 < r["hi"]


def test_step_test_finds_nothing_without_a_step():
    y, month = monthly_log_series(np.random.default_rng(10))
    r = step_test(y, month, 115)
    assert r["lo"] < 0 < r["hi"]


def test_pettitt_finds_injected_step_and_only_then():
    y, month = monthly_log_series(np.random.default_rng(11), step_at=115, step=1.0)
    k, p = pettitt(deseasonalize(y, month))
    assert abs(k - 115) <= 6 and p < 0.001
    y0, month = monthly_log_series(np.random.default_rng(12))
    assert pettitt(deseasonalize(y0, month))[1] > 0.05


def test_clock_recovers_known_onset():
    daily = np.zeros(365)
    daily[100:200] = 1.0  # 100 equal days: 10% on day 110, 50% on day 150, 90% on day 190
    marks = season_marks(daily * 7.3)  # scale must not matter
    assert (marks["onset"], marks["peak"], marks["end"]) == (110, 150, 190)
    assert season_marks(np.zeros(10)) is None


def test_fire_year_labels():
    dates = pd.Series(pd.to_datetime(["2020-06-30", "2020-07-01", "2021-06-30"]))
    assert fire_year(dates, 7).tolist() == [2019, 2020, 2020]
    assert day_of_fire_year(dates, 7).tolist() == [366, 1, 365]


def test_trend_statistics():
    x = np.arange(20.0)
    slope, lo, hi = theil_sen(x, 2 * x + 1)
    assert (slope, lo, hi) == pytest.approx((2.0, 2.0, 2.0))
    assert mann_kendall(2 * x + 1) < 0.001
    assert mann_kendall(np.random.default_rng(13).normal(size=20)) > 0.05


def test_cells_sum_to_region():
    cells = pd.DataFrame({
        "sat": ["aqua", "aqua", "snpp", "snpp", "snpp", "noaa20"],
        "ym": ["2005-09", "2005-09", "2015-09", "2015-09", "2015-10", "2026-11"],
        "ix": [1, 2, 1, 3, 1, 2], "iy": [1, 1, 1, 1, 1, 1], "fire_days": [4, 6, 10, 30, 5, 2]})
    hm = pd.DataFrame({
        "ym": ["2005-09", "2005-11", "2015-09", "2015-10", "2026-11"],
        "source": ["aqua-translated", "aqua-translated", "snpp", "snpp", "noaa20-translated"],
        "partial": [False, False, False, False, True],
        "harmonized": [33.0, 2.5, 40.0, 5.0, 2.2]})
    out = allocate_cells(cells, hm)
    sums = out.groupby("ym")["value"].sum()
    assert sums.to_dict() == pytest.approx(hm.set_index("ym")["harmonized"].to_dict())
    # 2005-09: cell (1,1) gets 0.7*4/10 from Aqua plus 0.3*10/40 from the September climatology
    got = out[(out["ym"] == "2005-09") & (out["ix"] == 1)]["value"].iloc[0]
    assert got == pytest.approx(33.0 * (0.7 * 0.4 + 0.3 * 0.25))
    # 2005-11 has no Aqua cells and no November climatology: falls back to the all-month climatology
    assert len(out[out["ym"] == "2005-11"]) == 2


def fixture_frame():
    c = pd.DataFrame(FIXTURE["cases"])
    c["ts_utc"] = pd.to_datetime(c["acq_date"] + " " + c["acq_time"], format="%Y-%m-%d %H%M")
    return c


def test_grid_fixture_cells():
    c = fixture_frame()
    ix, iy = cell_index(c["lat"], c["lon"], FIXTURE["grid"])
    assert ix.tolist() == c["ix"].tolist()
    assert iy.tolist() == c["iy"].tolist()


def test_local_solar_date_rollover():
    c = fixture_frame()
    date_local, lst_hour = local_solar(c["ts_utc"], c["lon"])
    assert date_local.dt.strftime("%Y-%m-%d").tolist() == c["date_local"].tolist()
    assert ((lst_hour >= 0) & (lst_hour < 24)).all()
    # Either side of the antimeridian at the same instant: one calendar day apart, same sun time
    assert lst_hour[4] == pytest.approx(0.4933, abs=1e-3)
    assert lst_hour[5] == pytest.approx(23.5067, abs=1e-3)


def test_fire_days_counts_each_cell_date_once():
    df = pd.DataFrame({
        "sat": ["snpp"] * 4, "lat": [10.01, 10.02, 10.01, 10.30], "lon": [20.01, 20.02, 20.01, 20.01],
        "date_local": pd.to_datetime(["2020-01-01", "2020-01-01", "2020-01-02", "2020-01-01"]),
        "frp": [1.0, 2.0, 3.0, 4.0], "daynight": ["D", "N", "N", "D"]})
    fd = fire_days(df, 0.25)
    assert len(fd) == 3
    first = fd.iloc[0]
    assert (first["n_pixels"], first["n_day"], first["n_night"], first["frp_sum"]) == (2, 1, 1, 3.0)


def test_country_clip_handles_holes_and_islands():
    import numpy as np
    from lib.country import inside_rings
    square = np.array([[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]], dtype=float)
    hole = np.array([[1, 1], [1, 2], [2, 2], [2, 1], [1, 1]], dtype=float)
    island = np.array([[6, 0], [7, 0], [7, 1], [6, 1], [6, 0]], dtype=float)
    lon = np.array([3.0, 1.5, 6.5, 5.0, -1.0])
    lat = np.array([3.0, 1.5, 0.5, 0.5, 2.0])
    assert inside_rings([square, hole, island], lon, lat).tolist() == [True, False, True, False, False]


def test_forecast_climatology_uses_earlier_years_only():
    import numpy as np
    import pandas as pd
    from forecast import frame
    yms = [f"{y}-{m:02d}" for y in range(2001, 2005) for m in range(1, 13)]
    values = np.arange(len(yms), dtype=float)
    hm = pd.DataFrame({"ym": yms, "harmonized": values, "partial": False})
    d = frame(hm)
    jan = d[d["month"] == 1].reset_index(drop=True)
    assert np.isnan(jan["clim"].iloc[0])
    assert jan["clim"].iloc[2] == np.median(np.log1p([values[0], values[12]]))
