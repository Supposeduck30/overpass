# Overpass build notes

Running log of what was checked against real FIRMS data, what was decided, and what a person
still has to look at. The final report goes at the top of this file when the build is done.

## Milestone 1: ground truth (checked 14 Nov 2026)

### What the FIRMS services actually do

- Country archive pattern is correct: `https://firms.modaps.eosdis.nasa.gov/data/country/{modis|viirs-snpp}/{year}/{product}_{year}_{Country}.csv`, plain CSV, not zipped.
- Archive years: `modis` 2000–2025, `viirs-snpp` 2012–2025. 2026 returns 404. There are no NOAA-20 or NOAA-21 country archives.
- Area API accepts a day range of 1 to 5 only ("Invalid day range. Expects [1..5]").
- A 5-day area call costs about 10 transactions, so the 5,000 per 10 minutes limit is roughly 500 calls per 10 minutes. `fetch.py` waits the window out instead of failing.
- Long country files (United States) can drop mid-stream; `fetch.py` discards the partial file and retries.
- Columns, MODIS: `latitude, longitude, brightness, scan, track, acq_date, acq_time, satellite, instrument, confidence, version, bright_t31, frp, daynight, type`. VIIRS: the same with `bright_ti4` and `bright_ti5`. NRT files have no `type` column.
- `satellite` values seen: `Terra`, `Aqua`, `N` (S-NPP), `N20`, `N21`. Anything else is a hard error in `clean.py`.
- `acq_time` arrives as an unpadded integer in the archives; it is zero-padded.
- Aqua and Terra are separable, so the dial keeps its Terra arc.

### Availability on 14 Nov 2026

| Source | First | Last |
|---|---|---|
| MODIS_SP | 2000-11-01 | 2026-08-31 |
| MODIS_NRT | 2026-09-01 | 2026-11-14 |
| VIIRS_SNPP_SP | 2012-01-20 | 2026-07-31 |
| VIIRS_SNPP_NRT | 2026-08-01 | 2026-11-02 |
| VIIRS_NOAA20_SP | 2018-04-01 | 2026-07-31 |
| VIIRS_NOAA20_NRT | 2026-08-01 | 2026-11-14 |
| VIIRS_NOAA21_SP | 2023-03-01 | 2026-07-31 |
| VIIRS_NOAA21_NRT | 2024-01-17 | 2026-11-14 |

Historical S-NPP NRT (Aug to 2 Nov 2026) is still served, so the measured S-NPP era runs to
the real handoff and the §15 fallback for that risk was not needed.

### Córdoba row counts

| Step | Rows |
|---|---|
| Raw detections in the box (all satellites) | 312,309 |
| Dropped: not vegetation fire (`type` ≠ 0) | 3,642 |
| Dropped: untyped NRT inside the static-source mask | 163 |
| Dropped: low confidence | 21,104 |
| Kept | 287,400 |

Kept by satellite: Aqua 55,049 (2002-07-05 to 2026-11-13), Terra 33,269, S-NPP 130,495
(2012-01-20 to 2026-11-01), NOAA-20 66,036 (2020-01-01 to 2026-11-13), NOAA-21 2,551 (2026 only).
Fire-days at 0.25°: 85,781.

## Milestone 2: the record (Córdoba)

Unit: fire-days at 0.25°. Reference: S-NPP.

| Check | Result |
|---|---|
| Aqua to S-NPP, leave-one-year-out median error | M0 22.6%, M1 22.6%, M2 20.2%, **M3 12.2%**, M4 13.8% |
| NOAA-20 to S-NPP, leave-one-year-out median error | identity 7.3%, **M0 6.9%**, M1 6.9%, M2 6.9%, M3 7.2%, M4 8.8% |
| Exchange rate, Aqua to S-NPP | ×3.55 (3.37–3.75) at 43 Aqua fire-days, the median burning month |
| Handoff factor, NOAA-20 to S-NPP | 0.961 (0.950–0.972); NOAA-21 reads 1.06 × NOAA-20 in 2026 |
| Backward test (fit 2016–2020, predict 2012–2015) | median error 14.5%, bias −4.7%, 90% interval covered 85% |
| Forward test (fit 2012–2017, predict 2018–2020) | median error 10.9%, bias −1.2%, covered 94% |
| 90% interval coverage, held-out years | link 1: 84% raw, widened ×1.16 to 90%; link 2: 85% |
| Step at Feb 2012, raw records | +0.99 log units (0.69 to 1.29), a ×2.7 jump |
| Step at Feb 2012, harmonized | −0.16 log units (−0.42 to +0.10); the interval includes zero |
| Pettitt change point | raw 2012-02; harmonized 2012-08; Aqua alone 2012-08 |
| Steadiest unit (CV of the monthly exchange rate) | day-only fire-days 0.34, pixels 0.35, fire-days 0.25° 0.36, 0.5° 0.36, 0.1° 0.37 |
| Aqua daytime overpass, local solar time | 13.9 h through 2021, then 14.3, 14.6, 15.1, 15.8 h in 2023–2026 |
| S-NPP ÷ Aqua yearly ratio | 2.7–3.5 in 2012–2020; 3.3, 2.9, 3.3, 2.6, 3.2, 3.7 in 2021–2026 |
| Season timing | overlap check: Aqua and S-NPP marks differ by 15 days on average; peak +5.6 days per decade, p = 0.12 |
| Top fire years | 2003 (4,915), 2004 (4,374), 2006 (3,788), 2005 (3,693), 2008 (3,668) |

### Which claims held

- **Held:** the raw record has a seam at 2012 (×2.7) and the harmonized record does not show a step there.
- **Held:** a log-linear translation beats a single factor (12.2% against 22.6%).
- **Held, with a caveat:** intervals. Raw coverage was 84%, below the 85% floor, so they were widened ×1.16 from the held-out residuals (the §15 fallback). The app says so.
- **Did not hold:** "fire-days are steadier than pixels". All five units sit between 0.34 and 0.37; fire-days at 0.25° is not the steadiest. The difference is too small to justify switching the unit, so the unit stays and the Evidence view shows the tie as it is.
- **Did not hold:** "NOAA-20 is interchangeable with S-NPP". NOAA-20 reads about 4% higher here, and a factor beats identity, so link 2 uses the factor.
- **Did not hold as a causal claim:** Aqua's drift is plainly measured (+112 minutes by 2026), but the S-NPP ÷ Aqua ratio stayed inside its 2012–2020 range in 4 of 5 later years. The app reports "no clear effect detected" and keeps 2012–2020 as a cautious calibration window (§15).
- **Cannot be tested yet:** a step at the Nov 2026 handoff. No full NOAA-20-only month exists. The overlap since 2020 stands in for it.
- **Needs a reader's care:** Pettitt still finds a change point in the harmonized series (Aug 2012). Aqua alone, a single instrument for the whole record, shows the same one, and so does Terra's raw yearly total (about 870 fire-days a year in 2003–2011, about 450 in 2012–2019). That points to less burning in the box after 2012, not a leftover seam. A person should confirm this against local knowledge.

## Decisions (one line each)

- Residuals for intervals: nearest-neighbour log1p residuals for every rung, not a different residual type per rung. Simpler and the same code path for all models.
- Harmonized value is the point prediction; lo and hi are the 5% and 95% bootstrap quantiles, widened if held-out coverage is under 85%.
- A more complex rung is promoted only if it is 5% better **and** better in at least 90% of paired month resamples. Without the second rule pure-factor synthetic data picked M2 or M3 about one time in five.
- Critical months and the fire-year start come from full S-NPP years only.
- "CV" in the unit check is the lognormal CV of the monthly exchange rate. "Saturation" is fire-days ÷ (active cells × days) in the S-NPP peak month.
- July 2002 is marked partial: Aqua's record begins on 4 July.
- Calendar "versus normal" uses full-record calendar-month medians (`normals`); each month's `median` and `percentile` use past months only.
- With one region prepared, M0 (global factor) equals M1. `calibrate.py` is re-run for all regions when the atlas arrives so M0 is truly pooled.
- Added a Pettitt test on Aqua alone as a single-instrument control for the harmonized change point.
- Web: plain three.js instead of react-three-fiber (one custom-shader mesh; less bundle, direct disposal). The contrast and ramp check is a vitest test, so `npm run build` fails if AA is missed.
- Data contract additions over §9: `partial`, `normals`, `unitColumn`, per-link `factor`, `exchange`, `coverage90` in `monthly.json`; `hotspots` flag in `regions.json`; `atSourceCount`, `link2Lo`, `link2Hi`, `link2Model` in `atlas.json`; `aquaOnly` under `seams.pettitt`, `driftEffect`, `ladderLink2`, `coverage90Raw`, `intervalScale` in `validation.json`.
- Season trends: onset and end differ by 19 and 22 days between Aqua and S-NPP in the same years, so a trend across the 2012 switch is not comparable for those marks (flagged `comparable: false` when the overlap difference is over 7 days). The peak differs by 4 days and is comparable. `trendAquaOnly` gives the same marks from Aqua alone as a control: the apparent +30 days per decade in season length across satellites is −1 (−18 to +16) from Aqua alone, so the app does not claim a longer season.
