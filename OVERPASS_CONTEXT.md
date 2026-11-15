# OVERPASS — Project Context & Build Spec

NASA Space Apps Challenge 2026, challenge "Harmonization of MODIS and VIIRS Hot Spots"
Version 2.0, written Sat Nov 14 2026, ~4 p.m. Central. The hackathon is live.
Deadline: Sun Nov 15, 11:59 p.m. Central. Internal target: submitted by 10:00 p.m.

This file is the single source of truth. Put it at the repo root. When it disagrees with
memory, this file wins. When it disagrees with an official NASA page or with what a real
download shows, reality wins and this file gets edited.

---

## 0. What changed from v1.0, and why

| # | v1.0 | v2.0 | Reason |
|---|---|---|---|
| 1 | Record anchored on Suomi NPP, "live month" from `VIIRS_SNPP_NRT` | **Three satellites, two handoffs.** Aqua → S-NPP (2012) → NOAA-20 (Nov 2026). Live data from NOAA-20 | FIRMS stopped producing S-NPP active fire data on **Nov 2, 2026**. v1.0's live tab would have been empty and its "outlives MODIS" claim rested on a satellite that ended two weeks ago |
| 2 | Aqua drift shown with "approximate values from NASA notices" on a globe | **Drift measured from the data**: local solar time = `acq_time` + longitude/15, median per satellite per year | Every FIRMS row carries its own overpass time. Measured beats quoted, and it removes the only scene that was not data-driven |
| 3 | Band = bootstrap of model parameters | **Prediction interval** (parameter + residual uncertainty) with **coverage reported** on held-out years | A parameter band is too narrow; an interval nobody has checked is decoration |
| 4 | One fixed backtest split, one strawman baseline | **Leave-one-year-out CV over a model ladder** (global factor → regional factor → seasonal factor → log-linear → quantile map), plus forward and backward splits | 3 test years is thin. The backward split is the real task (translating the past). Ship whichever rung wins, even if it is the simple one |
| 5 | Region model applied to each cell | **Top-down allocation**: region total is modelled, then shared out to cells. Cells always sum to the region | A log-linear model with an intercept predicts fire in every empty cell, and cell sums stop matching the regional number |
| 6 | "This Month" compares a partial month with full past months | Compares **days 1..d with days 1..d** of every past same-month | Mid-month, v1.0 would always read "below normal" |
| 7 | 2–3 regions; drawing elsewhere fails | 2 hero regions + an **overnight atlas batch** of ~8 more across continents; **live last-31-days hotspots for any box on Earth** | A judge who draws a box outside Argentina should get something. The atlas also produces the map that proves "one global factor is wrong" |
| 8 | UTC date | **Local solar date** | Keeps one afternoon and the night after it in a consistent day everywhere |
| 9 | Pettitt only | **Step test at the known handoff dates** (primary) + Pettitt (secondary) | We know when the sensor changed; test there. Pettitt p-values are inflated by autocorrelation |
| 10 | Four 3D scenes incl. an orbit globe | **Cliff Melt** (hero) and **Column Flyover** in 3D, **Overpass Dial** in 2D, Helix as stretch. Globe dropped | A rival already ships an orbit globe; ours was the least data-driven scene |
| 11 | No visual direction | Full design system in §13 | "Dark dashboard with orange glow" is what 600 other teams will submit |
| 12 | Terra unused; record starts Jul 2002 | Optional **Terra-translated extension back to Nov 2000**, drawn hatched, wider band | Cheap once the pipeline exists; statement says "early 2000s" |

---

## 1. Rules for anyone (human or AI) writing code here

1. **Never invent data, numbers, column names or URLs.** Anything marked VERIFY is checked at
   runtime: assert expected columns, print what was found, fail loudly.
2. **Science before polish.** The harmonized series and the validation numbers come first;
   every chart reads from them.
3. **Every number on screen traces to a file in `web/public/data/`** written by the pipeline.
   No hard-coded example values in shipped UI. Mock data lives only in `web/src/mock/` and is
   deleted before the gate in §17.
4. **Secrets stay out of the repo.** `.env*` is in `.gitignore` before the first commit.
5. **Boring, working code.** Python + pandas pipeline; Vite + React + TypeScript app. No
   database, no auth. Two small serverless functions.
6. **Each pipeline stage reads files and writes files** and can be re-run alone.
7. **Report results honestly.** If a check fails or a claim does not hold in the data, the
   Evidence view says so. A stated failure is worth more to a judge than a hidden one.
8. **No NASA logos, mission patches or agency insignia** anywhere.
9. No names, voices or likenesses of anyone under 18, and no personal information, in the repo,
   app or video.

---

## 2. Snapshot

| Item | Value |
|---|---|
| Team | Overpass (Universal Event, virtual; needs ≥ 2 registered members, max 6) |
| Challenge page | https://www.spaceappschallenge.org/2026/challenges/modis-and-viirs-hot-spots/ |
| NASA resource | FIRMS: https://www.earthdata.nasa.gov/data/tools/firms |
| Submission closes | Sun Nov 15, 11:59 p.m. team-owner local time |
| License | Apache-2.0 |
| Demo | ≤ 30 s video or ≤ 7 slides, public link, English |

What the statement asks for: a web app that harmonizes MODIS and VIIRS hotspots into a
burning-activity calendar. A user picks a region and date range and gets analytics and
downloads. It should show: a calendar from the early 2000s to now; which months and years
burned most; the current month against the historical median; accessible color ramps for
month-to-month differences; a CSV of hotspots; area selection by drawing or by lat/lon.
Audience: emergency responders, scientists, land managers, firefighters.

Submission rules that touch the build: public links with no login; every external dataset,
library, image and text listed in References; original work under an OSI license; AI-generated
images or video need a visible watermark; AI-generated content may not use NASA branding.
The team handles the "Use of SI" field, `AI_USE.md` and any code-header acknowledgments
itself before submitting.

Judging: Impact, Creativity, Validity, Relevance, Presentation, each 1–5.
Targets: Best Use of Science, Best Use of Data, Galactic Impact.

---

## 3. The idea

**One sentence.** The fire record has been carried by three satellites; Overpass translates
every era into one unit, proves the seams are gone, and shows how sure it is.

**Why now.** The afternoon fire record has two seams. In January 2012 the sharper VIIRS sensor
on Suomi NPP arrived and counts jumped. On November 2, 2026, Suomi NPP's fire data stopped and
NOAA-20 took over. Aqua MODIS, the oldest runner, has been drifting to a later overpass since
2022 and ends science operations in 2027. Any tool that compares "this month" with history has
to cross both seams.

```
 2000      2002                2012                         2026-11      2027
  |--Terra--|                                                             (ends Feb)
            |------ Aqua MODIS (1:30 pm, drifting later after 2021) ------(ends Sep)
                                |------ Suomi NPP VIIRS (1:30 pm) --------|
                                              2018 |------ NOAA-20 VIIRS (1:30 pm) ----->
                                                          2023 |-- NOAA-21 VIIRS ------->
            [ link 1: Aqua→S-NPP, fit 2012–2020 ]   [ link 2: S-NPP→NOAA-20, fit on overlap ]
```

**Method in five moves** (team-owned; revise together):

1. **Match the overpass.** Calibrate Aqua against S-NPP, and S-NPP against NOAA-20. All three
   cross near 1:30 p.m./a.m. Terra (10:30) stays out of the main series.
2. **Calibrate on the clean overlap.** Link 1 uses 2012–2020, before Aqua drifted. The drift
   is measured from detection timestamps, not assumed.
3. **Count fire-days, not pixels.** A fire-day is one 0.25° cell on one local date with ≥ 1
   qualifying detection. This is a hypothesis; §8 tests it and the app follows the result.
4. **Fit per region, pick the model by cross-validation.** A model ladder from one global
   factor up to quantile mapping. The simplest rung that wins is shipped.
5. **Carry the uncertainty.** Every translated month has a 90% prediction interval, and the
   Evidence view reports how often held-out truth fell inside it.

**Unit.** "VIIRS-equivalent fire-days (S-NPP reference)". 2012-02 → 2026-10 is measured S-NPP.
Before that is Aqua translated up. From 2026-11 it is NOAA-20 translated across (expected
exchange rate near 1; measured, not assumed).

**Questions the app answers.**
1. Is this month unusual here? (median, percentile, same-days-so-far comparison)
2. Which months and years burn most? (calendar, marginal totals, critical months)
3. Is the season moving? (onset, peak, end per fire year with a trend)
4. Can I trust it? (Evidence view)

---

## 4. Facts the method relies on

| | MODIS (Terra, Aqua) | VIIRS 375 m (S-NPP, NOAA-20, NOAA-21) |
|---|---|---|
| Pixel at nadir | ~1 km | 375 m |
| Record | Terra 2000; Aqua mid-2002 | S-NPP Jan 2012 – Nov 2 2026; NOAA-20 from 2018; NOAA-21 from 2023 |
| Equator crossing | Terra ~10:30; Aqua ~1:30 until drift began (free drift since 2022) | ~1:30; NOAA-20/21 fly the S-NPP orbital plane about 50 minutes apart |
| Swath behavior | Detection and FRP vary strongly with view angle | Fairly stable |
| End | Terra science Feb 2027; Aqua Sep 2027 (NASA plan) | S-NPP ended; JPSS continues |

- VIIRS detects more fires than MODIS by an amount that depends on place and fire size
  (Schroeder et al. 2014; later regional studies report much larger ratios). One global factor
  cannot be right everywhere. §8 measures this per region.
- `type` field in standard-processing files: 0 vegetation fire, 1 volcano, 2 other static land
  source, 3 offshore. NRT rows have no `type`.
- Confidence: MODIS 0–100; VIIRS `l`/`n`/`h`.
- Detections are presence-only. No detection does not mean no fire (cloud, smoke, timing).
- NRT data are replaced by standard-processing (SP) data after roughly five months.
- FIRMS itself tells S-NPP API users to switch to `VIIRS_NOAA20_NRT` / `VIIRS_NOAA21_NRT`.

---

## 5. Regions

Everything is a "region": an id, a FIRMS country file, a bounding box. The pipeline is the
same for all of them. Bboxes below are approximate (W,S,E,N) and must be sanity-checked on the
map before they ship.

**Hero (must work end to end before anything else):**

| id | Name | Country file | Bbox | Why |
|---|---|---|---|---|
| `cordoba` | Córdoba, Argentina | Argentina | -65.8,-35.0,-61.7,-29.5 | Strong season straddling New Year; CONAE is a 2026 partner |
| `california` | California, USA | United_States | -124.5,32.5,-114.1,42.0 | Large fires; familiar to judges |

**Atlas (overnight batch, smallest downloads first; skip any that fail):**

| id | Name | Country file (VERIFY spelling) | Bbox | Regime |
|---|---|---|---|---|
| `portugal` | Portugal | Portugal | -9.6,36.9,-6.1,42.2 | Mediterranean, 2017 |
| `punjab` | Punjab–Haryana, India | India | 73.8,27.6,77.6,32.6 | Small crop-residue fires; expect a large exchange rate and a visible drift effect |
| `zambia` | Zambia | Zambia | 21.9,-18.1,33.8,-8.2 | Savanna; tests fire-day saturation |
| `kalimantan` | Central Kalimantan, Indonesia | Indonesia | 110.7,-3.6,116.0,0.8 | Peat, 2015 and 2019 |
| `se_australia` | Southeast Australia | Australia | 140.9,-39.2,153.7,-28.1 | Black Summer 2019–20 |
| `mato_grosso` | Mato Grosso, Brazil | Brazil | -61.7,-18.1,-50.2,-7.3 | Deforestation arc |
| `alberta` | Alberta, Canada | Canada | -120.0,49.0,-110.0,60.0 | Boreal, 2023 |
| `sakha` | Central Sakha, Russia | Russian_Federation | 120.0,60.0,135.0,66.0 | Boreal, 2021 |

Large country files (USA, Brazil, Australia, Canada, Russia) are stream-filtered to the bbox
while downloading; the raw file is not kept.

---

## 6. Data sources

Checked against the live services on 14 Nov 2026; `NOTES.md` holds the availability table and
row counts. Items below are stated as verified.

### 6.1 Country yearly archives (history, no key)
- Products: MODIS C6.1 (Terra+Aqua, from 2000) and VIIRS S-NPP 375 m (from 2012). NOAA-20/21
  have no country archives.
- Verified pattern:
  `https://firms.modaps.eosdis.nasa.gov/data/country/{product}/{year}/{product}_{year}_{Country}.csv`
  with `{product}` in `modis` (2000–2025) and `viirs-snpp` (2012–2025). Plain CSV. The current
  year returns 404. Long files can drop mid-stream, so downloads retry.
- Archive coverage ends where SP ends. Find the last SP date per source from the availability
  endpoint and fill the remainder from the Area API.

### 6.2 Area API (needs free MAP_KEY: https://firms.modaps.eosdis.nasa.gov/api/map_key/)
- `https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/{SOURCE}/{W,S,E,N}/{DAY_RANGE}[/{YYYY-MM-DD}]`
  With a date: returns DATE … DATE+DAY_RANGE−1.
- Sources: `MODIS_SP`, `MODIS_NRT`, `VIIRS_SNPP_SP`, `VIIRS_SNPP_NRT`, `VIIRS_NOAA20_SP`,
  `VIIRS_NOAA20_NRT`, `VIIRS_NOAA21_SP`, `VIIRS_NOAA21_NRT`.
- `DAY_RANGE`: verified 1 to 5. Loop in 5-day chunks.
- Limit: 5,000 transactions per 10 minutes per key; a 5-day call costs about 10, so about 500
  calls per 10 minutes. Wait the window out when limited.
- Availability: `/api/data_availability/csv/{MAP_KEY}/all`. Call it first and log it.

### 6.3 What is fetched from where

| Series | Period | Source |
|---|---|---|
| Aqua + Terra MODIS | 2000 → last archive year | country archive |
| Aqua MODIS | after archive → today | `MODIS_SP` then `MODIS_NRT` (drift chart only) |
| S-NPP VIIRS | 2012 → last archive year | country archive |
| S-NPP VIIRS | after archive → 2026-11-02 | `VIIRS_SNPP_SP` (to 2026-07-31) then `VIIRS_SNPP_NRT` (verified still served, 2026-08-01 to 2026-11-02) |
| NOAA-20 VIIRS | 2020-01-01 (or first available) → today | `VIIRS_NOAA20_SP` then `VIIRS_NOAA20_NRT`, 5-day chunks |
| NOAA-21 VIIRS | 2026 only | `VIIRS_NOAA21_SP` then `VIIRS_NOAA21_NRT`, cross-check only |

One region is roughly 700 area calls (about 500 of them NOAA-20). Cache every response on disk by
(source, bbox, start date); a re-run makes zero calls.

### 6.4 Columns (verified, asserted in code)
- MODIS: `latitude, longitude, brightness, scan, track, acq_date, acq_time, satellite,
  instrument, confidence, version, bright_t31, frp, daynight` (+ `type` in SP/archive; NRT has none).
- VIIRS: same with `bright_ti4`, `bright_ti5`.
- `satellite` values seen: `Terra`, `Aqua`, `N` (S-NPP), `N20`, `N21`. They are mapped
  explicitly (`A`/`T` also accepted). Unknown value = hard error.
- `acq_time` is HHMM UTC, sometimes an integer without leading zeros. Zero-pad.

### 6.5 Supporting sources
- Natural Earth (public domain): land, country and admin-1 outlines for the base map.
- CONAE heat-spot catalog (optional partner cross-check): https://catalogos5.conae.gov.ar/catalogofocos

---

## 7. Pipeline (Python 3.11+)

Stages read from `pipeline/data/` and write back to it; `export.py` writes the app's files to
`web/public/data/`. All settings in `pipeline/config.yaml`.

```yaml
grid_deg: 0.25
calibration_years: [2012, 2020]      # link 1; S-NPP's first full month is 2012-02
link2_start: 2020-01-01              # S-NPP ↔ NOAA-20 overlap, to the last S-NPP date
snpp_end: 2026-11-02                 # VERIFY against data actually returned
bootstrap_iterations: 500
random_seed: 42
modis_min_confidence: 30
viirs_keep_confidence: ["n", "h"]
keep_types: [0]
min_fire_days_for_clock: 30
regions: [ ... §5 ... ]
```

### 7.1 `fetch.py`
Availability call → archives → Area API fill, per §6.3. Log rows per file. Retry twice with
backoff; a hard failure names the URL and status. `--region` and `--only-missing` flags.

### 7.2 `clean.py`
1. Assert columns; lowercase names.
2. `ts_utc` from `acq_date` + zero-padded `acq_time`.
3. **Local solar time**: `lst = ts_utc + longitude/15 hours`. `date_local = lst.date()`.
   `lst_hour` (float) is kept; the drift measurement uses it.
4. `type`: keep `keep_types`. Rows without `type` (NRT) are kept, flagged
   `type_known=False`, and dropped if they fall in a **static-source mask**: 0.01° cells that
   held type 1/2/3 detections in archive years.
5. Confidence: MODIS ≥ 30; VIIRS in {n, h}.
6. Map `satellite` → `aqua | terra | snpp | noaa20 | noaa21`.
7. Clip to bbox. Write `clean/{region}/{sat}.parquet`:
   `ts_utc, date_local, lst_hour, lat, lon, frp, daynight, confidence, sat, type_known, proc`.

### 7.3 `grid.py`
`ix = floor((lon+180)/g)`, `iy = floor((lat+90)/g)`. Per satellite, cell, local date:
`n_pixels, frp_sum, n_day, n_night`. One row = one fire-day. Also run at g = 0.1 and 0.5 for
the unit test in §8.3 (region totals only).

### 7.4 `aggregate.py`
Per region, satellite, month: `fire_days, pixels, frp_sum, active_cells, fire_days_dayonly`.
Per cell, satellite, month: `fire_days`. Per region, satellite, local date: `fire_days`
(daily series for the clock, month-to-date and season-to-date).

### 7.5 `calibrate.py`

**Model ladder** (V = target satellite monthly fire-days, M = source satellite):

| Rung | Model |
|---|---|
| M0 | one global factor: ratio of sums pooled over every prepared region |
| M1 | regional factor: ratio of sums in this region |
| M2 | regional factor per season (inside vs outside the region's critical months) |
| M3 | log-linear: log(V+1) = a + b·log(M+1), Duan-smeared back-transform, floor 0 |
| M4 | empirical quantile mapping on the overlap distribution |

- **Selection:** leave-one-year-out CV over the calibration years; metric = median absolute
  percentage error on months with V ≥ 5, tie-break on MAE. A more complex rung must beat the
  simpler one by > 5% relative to be chosen.
- **Prediction interval:** bootstrap calibration years (block = year, B = 500), refit, and add
  a resampled residual (log scale for M3; ratio residual for M1/M2; rank-neighbor spread for
  M4). Store 5th/50th/95th → `lo, harmonized, hi`.
- **Link 1:** source Aqua, target S-NPP, fit 2012-02 … 2020-12. Applied to 2002-07 … 2012-01.
- **Link 2:** source NOAA-20, target S-NPP, fit on `link2_start` … last S-NPP month. Same
  ladder. If the fitted factor's 90% interval contains 1 and LOYO error is within noise, use
  identity and say so. Applied from 2026-11.
- **Terra extension (stretch):** source Terra, target S-NPP, same code; applied 2000-11 …
  2002-06; flagged `terra-translated`, always drawn hatched.
- **Measured months** (S-NPP 2012-02 … 2026-10): `lo = hi = harmonized`.
- **Cells (top-down):** for a translated month, cell share
  `w_c = 0.7·(source cell fire-days / source region total) + 0.3·(S-NPP climatological share
  of that cell for that calendar month)`; if the source region total is 0, use the
  climatological share alone. `cell_value = w_c × regional harmonized`. Assert cells sum to
  the region within 1e-6. State in Methods that sub-regional values are an allocation.
- Output: `model/{region}.json`, `harmonized/{region}/monthly.parquet`, `cellmonthly.parquet`.

### 7.6 `validate.py` → `{region}/validation.json`

1. **LOYO table** for every rung (medAPE, MAE, log-R², bias). The app shows the whole ladder.
2. **Forward split:** fit 2012–2017, predict 2018–2020. **Backward split:** fit 2016–2020,
   predict 2012–2015. Store point pairs for scatter plots. The backward split is the headline.
3. **Interval coverage:** share of held-out months (LOYO) whose truth fell inside the 90%
   interval. Target 85–95%. Report the number whatever it is.
4. **Seam tests.** On the deseasonalized log monthly series, regress on a linear trend plus a
   step at 2012-02; report the step with a 95% CI (HAC/Newey-West errors) for the raw splice
   and the harmonized series. Same at 2026-11 if ≥ 1 full month exists. Then Pettitt
   (implemented directly, no dependency) as a secondary, assumption-free check.
5. **Unit stability:** coefficient of variation of the monthly log exchange rate log(V/M)
   for: fire-days at 0.1°, 0.25°, 0.5°; day-only fire-days; pixel counts. Also the share of
   cell-days at saturation in the peak month. The steadiest unit is the one the app uses; if
   that is not 0.25° fire-days, switch and record it in `notes`.
6. **Measured drift:** per satellite per year, median and IQR of `lst_hour` for daytime
   detections, plus the annual S-NPP/Aqua fire-day ratio. If the ratio does not move with
   Aqua's measured time after 2021, write "no clear effect detected".
7. **Handoff check:** NOAA-20 vs S-NPP monthly fire-days over the overlap: fitted factor,
   interval, scatter points; NOAA-21 vs NOAA-20 for 2026 as a spot check.
8. **Sanity:** top five fire years of the harmonized record. The team checks them against
   documented bad years for the region before trusting anything.
9. **Optional:** CONAE monthly counts vs ours for an Argentine region (seasonal correlation).

`atlas.json` (all regions): chosen rung, exchange rate at the regional median month with
interval, LOYO error of ours vs M0, coverage. This drives the exchange-rate map.

### 7.7 `clock.py` → `{region}/clock.json`
- Fire year starts the month after the climatological minimum month.
- Onset, peak, end = day of fire year when cumulative daily fire-days reach 10%, 50%, 90% of
  the year's total. These are invariant to a constant scale factor, so each era uses its own
  satellite's daily counts. Check that claim: Aqua-derived vs S-NPP-derived dates in 2012–2020;
  report mean absolute difference in days. Skip years below `min_fire_days_for_clock`.
- Trend: Theil–Sen slope (days/decade) with its confidence interval and a Mann–Kendall
  p-value, for onset, peak, end, length.

### 7.8 `nowcast.py` → `{region}/mtd.json`, `{region}/season.json`
- `mtd.json`: for each calendar month and each year, cumulative harmonized fire-days by day of
  month (daily source counts × that month's harmonized/source ratio). Lets the app compare
  days 1..d of this month with days 1..d of every past same-month.
- `season.json`: for each fire year, cumulative harmonized fire-days by day of fire year, plus
  the 10/25/50/75/90% envelope across years.

### 7.9 `forecast.py` (stretch) → `{region}/forecast.json`
Quantile gradient boosting for next month from calendar month, climatology and the last three
anomalies. Rolling-origin backtest 2016–2025 against climatology and persistence. Shown only
if it beats climatology; otherwise the Evidence view says it did not.

### 7.10 `export.py`
Writes §9 files, per-year gzipped hotspot CSVs for each region
(`{region}/hotspots/{year}.csv.gz`: date_local, time_utc, lat, lon, satellite, confidence,
frp, daynight, processing), and `meta.json` (build time, availability table, last date per
source, commit hash). If `web/public/data/` exceeds ~80 MB, drop atlas-region hotspot files
first and record that in `meta.json`.

### 7.11 `run_all.py` and tests
`python run_all.py --region cordoba`, `--all`, `--from-stage calibrate`.
`pipeline/tests/` (pytest, synthetic data only): V = 3×M recovered by M1 and M3; LOYO picks
the true rung on synthetic data; interval coverage near 90% on synthetic noise; step test and
Pettitt find an injected step and miss none where there is none; clock recovers a known onset;
cells sum to region; local-solar-date rollover at ±180° and at midnight.

---

## 8. Definitions (also shown in the app's Methods drawer)

- **Qualifying detection:** type 0 (or untyped NRT outside the static mask); MODIS confidence
  ≥ 30; VIIRS confidence nominal or high.
- **Fire-day:** a 0.25° cell on a local solar date with ≥ 1 qualifying detection.
- **Harmonized value:** VIIRS-equivalent monthly fire-days, S-NPP reference.
- **Interval:** 90% prediction interval; empty for measured months.
- **Normal:** the median of all past same-calendar-months. **Percentile:** rank among them.
- **So far this month:** days 1..d here versus days 1..d of each past same-month.
- **Critical months:** the fewest months that together hold ≥ 60% of mean annual fire-days.
- **Fire year:** begins the month after the climatological minimum month.
- **Exchange rate:** harmonized ÷ source at the region's median burning month.

---

## 9. Data contract (`web/public/data/`)

```jsonc
// regions.json
[{ "id":"cordoba","name":"Córdoba, Argentina","bbox":[-65.8,-35.0,-61.7,-29.5],
   "tier":"hero","fireYearStartMonth":3,"criticalMonths":[7,8,9,10,11],"hotspots":true }]

// atlas.json
[{ "id":"cordoba","model":"M3","exchangeRate":0,"lo":0,"hi":0,"atSourceCount":0,
   "medApeOurs":0,"medApeGlobalFactor":0,"coverage90":0,
   "link2Factor":0,"link2Lo":0,"link2Hi":0,"link2Model":"M0" }]

// {region}/monthly.json
{ "region":"cordoba","unit":"VIIRS-equivalent fire-days","unitColumn":"fire_days",
  "links":{ "aqua_snpp":{"model":"M3","params":{},"fit":"2012-02..2020-12",
                         "factor":{"value":0,"lo":0,"hi":0},
                         "exchange":{"atSourceCount":0,"rate":0,"lo":0,"hi":0},"coverage90":0},
            "noaa20_snpp":{"model":"identity|M0|M1|…","params":{},"fit":"…"} },
  "normals":[12 calendar-month medians of full months],
  "months":[{ "ym":"2002-07","harmonized":0,"lo":0,"hi":0,"partial":true,
              "source":"terra-translated|aqua-translated|snpp|noaa20-translated",
              "raw":{"aqua":0,"terra":0,"snpp":null,"noaa20":null},
              "pixels":{"aqua":0,"snpp":null},"median":0,"percentile":0 }] }

// {region}/cells.json  (sparse)
{ "grid":0.25,"cells":[[lat,lon],…],"months":["2002-07",…],
  "values":[[monthIndex,cellIndex,value],…] }

// {region}/mtd.json     { "byMonth": { "11": { "2003":[cum by day…], … } } }
// {region}/season.json  { "fireYearStartMonth":7,"years":{"2003":[cum by day…]},
//                         "envelope":{"p10":[…],"p25":[…],"p50":[…],"p75":[…],"p90":[…]} }

// {region}/clock.json
{ "years":[{"fireYear":2003,"onset":0,"peak":0,"end":0,"total":0,"sat":"aqua"}],
  "trend":{"onset":{"daysPerDecade":0,"lo":0,"hi":0,"p":0},"peak":{},"end":{},"length":{}},
  "overlapCheck":{"meanAbsDiffDays":0} }

// {region}/validation.json
{ "ladder":[{"model":"M0","medApe":0,"mae":0,"r2log":0,"bias":0,"chosen":false}],
  "forward":{"train":"2012-2017","test":"2018-2020","points":[{"ym":"","pred":0,"lo":0,"hi":0,"actual":0}]},
  "backward":{"train":"2016-2020","test":"2012-2015","points":[]},
  "coverage90":0,"coverage90Raw":0,"intervalScale":1,"ladderLink2":[],"driftEffect":{"detected":false},
  "seams":{"2012-02":{"raw":{"step":0,"lo":0,"hi":0},"harmonized":{"step":0,"lo":0,"hi":0}},
           "pettitt":{"raw":{"ym":"","p":0},"harmonized":{"ym":"","p":0},"aquaOnly":{"ym":"","p":0}}},
  "units":[{"unit":"fire-days 0.25°","cv":0,"saturation":0,"chosen":true}],
  "drift":[{"year":2012,"aquaLst":0,"aquaLstIqr":[0,0],"snppLst":0,"terraLst":0,"ratio":0}],
  "handoff":{"factor":0,"lo":0,"hi":0,"points":[]},
  "topYears":[{"year":2020,"total":0}],
  "notes":["plain-language caveats and anything that failed"] }

// {region}/forecast.json   { "shown":false, "skill":{…}, "next":{…} }
// current/{region}.json     { "asOf":"…Z","ym":"2026-11","day":14,"fireDaysToDate":0,
//                             "harmonizedToDate":0,"source":"VIIRS_NOAA20_NRT","cached":false }
// meta.json                 { "builtAt":"…","commit":"…","availability":[…],"lastDate":{…} }
```

Types in `web/src/types.ts` mirror this exactly. A zod (or hand-written) guard validates each
file on load and the app shows a readable error if a file is malformed.

---

## 10. Web app: structure

**Stack.** Vite + React + TypeScript. D3 modules with hand-built SVG components for 2D charts.
MapLibre GL with a **local Natural Earth GeoJSON style** (no tile server, no map key).
three.js (react-three-fiber) for Cliff Melt. deck.gl for the Column Flyover. Plain CSS with
custom properties, one stylesheet per component. **No Tailwind, no component kit, no icon
pack.** Fonts self-hosted. Vercel hosting; `web/api/firms.ts` and `web/api/chat.ts`.

**State lives in the URL:** `?r=cordoba&from=2002-07&to=2026-11&v=calendar&box=w,s,e,n&mode=h`.

**Frame.**

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ (dial) Overpass     Córdoba, Argentina ▾    2002 ─●━━━━━━━━●─ 2026    Area   Download │
├──────────────────────────────────────────────────────────────────────────────────────┤
│  Calendar    This month    Season    Evidence    Scenes            Methods   Ask      │
├──────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  [ one finding sentence for the current view, set large ]                            │
│                                                                                      │
│  [ the view ]                                                                        │
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

Five views in the switcher. Methods and Ask open as right-hand drawers over any view. Area
opens a map sheet: presets outlined, draw a box, or type W, S, E, N.

### 10.1 Calendar (default)

```
 Counts | Versus normal          Raw records | Harmonized          Fire-days ▾
                    ▁ ▁ ▂ ▃ ▅ █ █ ▆ ▃ ▂ ▁ ▁      ← mean by month; critical months bracketed
                    J F M A M J J A S O N D
        ┌─────────────────────────────────────┐
   2002 │             ░ ░ ▒ ▒ ▓ ▒ ░           │▬▬▬
   2003 │ ░ ░   ░ ░ ▒ ▒ ▓ ▓ █ ▓ ▒ ░           │▬▬▬▬▬▬▬
    ⋮   │                                     │        ← annual totals, aligned to rows
   2011 │ ░     ░ ▒ ▒ ▓ █ █ ▓ ▒ ░             │▬▬▬▬▬
  ─ ─ ─ ┼ ─ ─ ─  VIIRS begins, Feb 2012 ─ ─ ─ ┼
   2012 │ ░ ░ ░ ▒ ▒ ▓ █ █ █ ▓ ▒ ░             │▬▬▬▬▬▬
    ⋮   │                                     │
   2026 │ ░ ░ ▒ ▒ ▓ █ █ ▓ ▒ ░ ◧               │▬▬▬▬      ← ◧ = month in progress
  ─ ─ ─ ┴ ─ ─ ─  NOAA-20 takes over, Nov 2026 ┴
        legend with numbers            Download: series CSV, hotspots CSV, PNG, table
```

- Rows are years, columns are months. The two satellite handoffs are labeled rules across the
  plate. In **Raw records** mode the rows below the 2012 rule are visibly brighter than those
  above; switching to **Harmonized** raises the upper rows over 900 ms (instant under reduced
  motion). That switch is the product's one orchestrated moment.
- **Versus normal** recolors to a diverging ramp: each month against its calendar-month median.
- Translated months carry a faint diagonal hatch whose density follows relative interval width.
- Hover or focus a cell: a readout line under the plate, not a floating card:
  "Sep 2008: 412 fire-days (340–498), translated from Aqua. Aqua counted 151."
- Arrow keys move between cells. A **Table** toggle swaps the plate for a sortable table.
- With a drawn box: the plate recomputes from `cells.json`; a note states it is an allocation.

### 10.2 This month
- Finding sentence, for example: "So far this November, Córdoba has burned less than in 19 of
  23 past Novembers."
- A strip: one mark per past same-month at its days-1..d value; this year marked in Sodium;
  median tick and middle-50% bar. Under it, the same for full past months in a muted tone so
  the difference between "so far" and "by month's end" is visible.
- Season-to-date cumulative curve against the 10–90% and 25–75% envelopes.
- States plainly: "Days 1–14, as of 14 Nov 18:00 UTC, from NOAA-20 (near-real-time)." If the
  live call failed, it says the figure is cached and from when.

### 10.3 Season
Dot plot: one row per fire year, onset–end as a bar with the peak as a dot, x = day of fire
year labeled with month names. Trend lines for onset, peak, end. Sentence: "Peak has moved 6
days later per decade (−2 to +14, p = 0.21). Not a clear trend." Shows the overlap check.

### 10.4 Evidence
Six numbered figures on one scroll, each with a one-sentence finding as its heading, a chart,
and a "what would change our mind" line:
1. **The seam.** Raw vs harmonized series with the step estimate at each handoff.
2. **Backward test.** Predicted vs actual, 2012–2015, with intervals; coverage figure.
3. **Model ladder.** LOYO error per rung as dots on one axis; chosen rung marked.
4. **Which unit is steadiest.** CV per unit; saturation share.
5. **The overpass dial.** §11.3.
6. **Exchange-rate atlas.** World map with one mark per prepared region; size/color = exchange
   rate, whisker = interval. Next to it: our error vs the global-factor error per region.
Then "What we could not verify" from `notes`, verbatim.

### 10.5 Scenes
Cliff Melt and Column Flyover (§11), each with a 2D twin link and a caption. "Play tour" runs
Calendar toggle → Cliff Melt → Dial → Column Flyover → This month, 6 s each, captions on.

### 10.6 Area and downloads
- Box inside a prepared region: instant from `cells.json`.
- Box elsewhere: "Overpass has no calibrated history here yet." plus what it can do: last 31
  days of NOAA-20 hotspots on the map and as CSV, through `/api/firms`.
- Downloads: harmonized monthly CSV (with lo, hi, source, raw counts); hotspots CSV for the
  selection and years (per-year gz files, decompressed and filtered in the browser); PNG of
  the calendar; JSON of the validation file.

### 10.7 Ask (stretch)
Drawer. `web/api/chat.ts` calls the Anthropic Messages API with tool use; model id from
`LLM_MODEL` env var; tools read the same JSON files (`list_regions`, `get_monthly`,
`get_month_status`, `get_season_clock`, `get_validation`). Answers only from tool results,
quotes value + interval + source, names the view that shows it, refuses forecasts and safety
directives (points to local authorities). Each answer is labeled "AI-generated answer" with a
"Show the data" link. Rate limit per IP; token cap. If `LLM_API_KEY` is absent the Ask control
is not rendered.

### 10.8 Serverless
`GET /api/firms?region=cordoba` → month-to-date from `VIIRS_NOAA20_NRT` in 5-day chunks,
gridded and filtered exactly like the pipeline, converted with link 2, returned in the
`current/{region}.json` shape; cached 3 h; on failure returns the last committed file with
`cached:true`. `GET /api/firms?box=w,s,e,n&days=31` → raw hotspots CSV for any box (area
capped). A shared fixture (`pipeline/tests/fixtures/grid_cases.json`) is asserted by both the
Python and the TypeScript gridding code.

### 10.9 Navigation and ease of use
- Frame always visible: view switcher, region menu, range slider, a **Play tour** control,
  Methods and Ask. Any view is one click from any other.
- First visit: one dismissible line under the switcher ("Try Harmonized", pointing at the
  toggle). No modals or multi-step coachmarks.
- Each view opens with its finding sentence and a collapsible one-line "How to read this".
  Readouts sit in a fixed spot.
- Keys: `1`–`5` views, `/` region menu, `a` Area, `t` table, `?` shortcuts, Esc closes
  drawers, sheets and the tour.
- Back/Forward and copied URLs reproduce the exact view (state in the URL).
- Mobile: bottom bar for the five views; bottom sheets for Area and region; 3D scenes open on
  their 2D twin with a "View in 3D" button.
- No icon-only controls. Unavailable options explain why.
- Acceptance: from a fresh load, (1) why 2012 looks odd, (2) the peak month, (3) whether this
  month is unusual, (4) a CSV for a drawn box, (5) the proof the method works, each in ≤ 3
  clicks.

### 10.10 Quality floor
WCAG AA contrast; full keyboard reach; visible focus; every chart has a sentence and a table
twin; `prefers-reduced-motion` disables auto-motion; Calendar and This month work at 375 px;
3D bundles lazy-load; core view interactive in under 2 s on a mid-range laptop.

---

## 11. Signature visuals

Every height, color and position comes from the data files.

### 11.1 Cliff Melt (three.js)
A terrain where x = month, z = year (oldest at the back), height = monthly fire-days. Each
vertex holds two heights, raw and harmonized. In raw mode the land is a low plain that hits a
wall at 2012 and continues on a plateau. "Harmonize" lifts the plain until the wall is gone
and the same seasonal ridges run unbroken from 2002 to 2026. Surface colored by the cividis
ramp on value; thin Sodium line traces the current year; the translated part shows its
interval as a translucent upper and lower sheet. Fixed three-quarter camera with slow orbit on
drag only; hover gives the same readout line as the calendar. Night-colored background.
Rendering: custom shader with a low raking directional light and smooth normals, contour
isolines at fixed heights, faint ridge emissive in the data ramp, the Sodium current-year
trace, and a very light bloom on emissive ridges and the trace only. No fog, particles or
lens effects. One 2.5 s camera settle on first open, then still until dragged. 60 fps target.

### 11.2 Column Flyover (deck.gl over the local MapLibre style)
One square column per 0.25° cell at its true position, height and color = harmonized fire-days
for the selected month; pitch ~50°. A month scrubber with play. Clicking a column opens that
cell's mini calendar. The handoff months show no jump in column heights; the caption says so.

### 11.3 Overpass Dial (SVG)
A 24-hour local-solar-time ring, noon at top. Each satellite is an arc spanning the IQR of its
measured daytime overpass times for the selected year, with a tick at the median. A year
slider (2002–2026) moves them: S-NPP and NOAA-20 stay put near 13:30; Aqua's arc slides later
after 2021; Terra sits near 10:30 and moves earlier. A small line chart beside it plots the
S-NPP/Aqua ratio against Aqua's measured time. A 20 px version of the dial at the current
year is the wordmark glyph in the header and the favicon.

### 11.4 Fire Helix (stretch)
Only if everything else is done and checked.

---

## 12. Copy

- Sentence case everywhere. No all-caps labels, no eyebrow labels above headings.
- Headings are findings with numbers in them, generated from data ("2020 burned most: 3,912
  fire-days, 2.4 times the median year"). Never "Overview", "Insights", "Dashboard".
- Name things as a land manager would: "fire-days", "normal for this month", "translated from
  an older satellite". Model names (M3) appear only in Evidence and Methods.
- Buttons say what happens: "Download monthly CSV", "Draw a box", "Show table".
- Empty and error states say what happened and what to do next. No apologies, no emoji.
- No arrows appended to links, no middle-dot separated meta strings, no exclamation marks.

---

## 13. Design system

**Concept.** The page is daylight; the data is the night side. Chrome, text and controls sit on
a cool overcast ground. Every data plate (calendar, 3D scenes, maps, the strip plot) is deep
night blue, and burning shows on it as light, the way fires look from orbit after dark. The
palette is the cividis ramp's own endpoints, so the brand and the colorblind-safe data scale
are the same thing. There is no orange, no red glow, no gradient, no glass.

**Color tokens.**

| Token | Hex | Use |
|---|---|---|
| `--overcast` | #E8ECEF | page ground |
| `--chalk` | #F6F8F9 | inputs, drawers, table rows |
| `--night` | #0B2343 | all text on light; plate background |
| `--slate` | #566575 | secondary text, axes on light (verify ≥ 4.5:1 on overcast) |
| `--signal` | #1F5FD1 | links, focus ring and selection on light surfaces |
| `--sodium` | #FFD84A | "now", selection and focus on plates only; never text on light |

Data ramps: sequential = `d3.interpolateCividis` (zero = plate color, not the ramp's first
step). Diverging for "versus normal" = light blue (#8FB8FF) ← plate mid-tone → Sodium, built in
OKLCH so lightness rises monotonically along each arm. A script checks monotonic lightness
and prints contrast ratios for every text/ground pair; the build fails if AA is missed.
A ramp menu offers Cividis (default) and Greys.

**Type.** One family: **Atkinson Hyperlegible Next** (OFL, self-hosted via fontsource; fall
back to Atkinson Hyperlegible if the package is unavailable). Chosen because it was drawn for
low-vision legibility, which is the brief's accessibility point made in the typography.
Weights 400, 600, 800. Numbers use `font-variant-numeric: tabular-nums` in the same face; no
monospace anywhere. Scale (px): 13, 15, 17, 22, 30, 44. Finding sentences are 30/36 at 600 on
desktop, 22/28 on mobile, max 60 characters per line, left aligned. Body 17/26, max 72 characters.

**Shape and space.** 8 px spacing unit. Plates have square corners and no border or shadow;
the color change is the edge. Controls have a 3 px radius and a 1.5 px Night outline; pressed
state fills Night with Chalk text. No cards, no drop shadows, no dividers between sections;
whitespace (48–72 px) separates them. Left-aligned throughout; nothing is centered except the
dial.

**Charts.** Axis labels in Slate at 13 px; no gridlines on plates, only tick marks; direct
labels on lines instead of legends where possible; one annotation per chart at most, written
as a sentence. Marks on plates are Chalk or ramp colors; "this year / now" is always Sodium.
Handoff rules are 1 px dashed Chalk at 50% with their label inline.

**Motion.** The 3D scenes also play one 2.5 s camera settle when first opened. Otherwise
three motions only: the calendar/terrain harmonize transition (900 ms,
cubic-in-out), the dial arcs following the year slider, the flyover scrubber. Nothing animates
on load or on scroll. Drawers slide 160 ms.

**What it must not look like.** Rounded cards with soft shadows; KPI tiles; a sidebar of
icons; purple or orange gradients; glassmorphism; dark mode with neon; emoji; a hero section
with three feature boxes; Inter, Space Grotesk or a serif display face; pill badges; skeleton
shimmer; toasts for routine actions.

---

## 14. Repository

```
overpass/
├── OVERPASS_CONTEXT.md   README.md   LICENSE   REFERENCES.md   .gitignore
├── pipeline/
│   ├── requirements.txt  config.yaml  .env.example
│   ├── fetch.py clean.py grid.py aggregate.py calibrate.py validate.py
│   ├── clock.py nowcast.py forecast.py export.py run_all.py
│   ├── lib/  io.py models.py stats.py pettitt.py solar.py
│   └── tests/
└── web/
    ├── package.json vite.config.ts index.html vercel.json .env.example
    ├── public/data/        # written by the pipeline, committed
    ├── public/geo/         # Natural Earth subsets
    ├── api/firms.ts  api/chat.ts
    └── src/
        ├── main.tsx App.tsx types.ts
        ├── state/url.ts  data/load.ts  data/guards.ts  lib/grid.ts  lib/format.ts
        ├── styles/tokens.css  styles/base.css
        ├── views/   Calendar/ ThisMonth/ Season/ Evidence/ Scenes/
        ├── parts/   Frame.tsx RegionMenu.tsx RangeSlider.tsx AreaSheet.tsx Downloads.tsx
        │            Readout.tsx Finding.tsx TableTwin.tsx Dial.tsx Methods.tsx Ask.tsx
        └── scenes/  CliffMelt.tsx ColumnFlyover.tsx Tour.tsx
```

---

## 15. Risks

| Risk | Sign | Fallback |
|---|---|---|
| Archive URL pattern wrong | 404s on first fetch | Read the country index page; else Area API `*_SP` in 5-day chunks for hero regions only |
| Historical S-NPP NRT (mid-2026 → Nov 2) no longer served | Empty responses | End the measured S-NPP era at the last SP date; NOAA-20 translated from there; move the handoff rule |
| NOAA-20 SP starts later than 2020 | Availability table | Use what exists; shorten link 2; widen its interval |
| Aqua/Terra not separable | `satellite` values | Use all MODIS, say so, drop the dial's Terra arc |
| Fire-days not steadier than pixels | §7.6.5 | Switch unit; everything downstream is unit-agnostic |
| Simple factor beats log-linear | LOYO | Ship the simple one and say it |
| Coverage far from 90% | §7.6.3 | Report it; widen with a conformal adjustment from LOYO residuals |
| Drift not visible | Flat ratio | Drop the causal claim; keep 2012–2020 as a cautious window |
| Data folder too big for the host | > 80 MB | Drop atlas hotspots, then round cells |
| 3D slow | < 30 fps | Fewer vertices; 2D twin becomes default |
| Live API down at judging | Errors | Committed `current/*.json` with timestamp |
| Team member unavailable Sunday | Silence > 2 h | Everyone knows how to submit |

---

## 16. Team decisions still open

1. Keep or change each of the five method moves in §3. Every member should be able to explain
   and defend them without notes.
2. Hero regions and whether `punjab` replaces `california` as the contrast.
3. Whether Ask ships.
4. Video or 7 slides.
5. Wording of the SI field, `AI_USE.md`, and code-header acknowledgments (team writes these).

---

## 17. Timeline (Central)

| When | Gate |
|---|---|
| Sat 4–5 p.m. | MAP_KEY in `pipeline/.env`; repo exists; team registration confirmed; build starts |
| Sat by 10 p.m. | Córdoba end to end on real data; team reads `validation.json` and checks top years against documented fire seasons |
| Sat midnight | **Gate A:** real harmonized calendar live on a public URL. Atlas batch starts and runs overnight |
| Sun 7–11 a.m. | Review atlas results; fix anything the numbers contradict; California checked |
| Sun 11 a.m.–3 p.m. | Scenes, Evidence copy, accessibility pass, mobile check; project page text drafted |
| Sun 5 p.m. | **Gate B:** feature freeze. No new code after this, only fixes |
| Sun 5–8 p.m. | Record the tour; cut the 30 s video; captions; References complete |
| Sun 8–10 p.m. | Fill every field; open every link in a private window; submit; see the confirmation |

Cut order if behind: Fire Helix → forecast → Ask → Terra extension → atlas regions →
Column Flyover → Cliff Melt. Calendar, This month, Evidence figures 1–3 and downloads are
never cut.

**30-second video.** 0–3 s: raw calendar, the 2012 wall ("The fire record jumps in 2012. The
fires didn't."). 3–9 s: harmonize; Cliff Melt ("Overpass translates every satellite into one
unit."). 9–15 s: dial with Aqua sliding, then the Nov 2026 handoff rule ("Suomi NPP went quiet
on November 2. The record keeps going."). 15–23 s: backward test and atlas ("Tested blind
against years it never saw, in ten regions."). 23–30 s: This month ("Is this month unusual?
Now you can ask. Free and open, built on NASA FIRMS.").

---

## 18. Sources

- Challenge: https://www.spaceappschallenge.org/2026/challenges/modis-and-viirs-hot-spots/
- Submission guide: https://www.spaceappschallenge.org/resources/project-submission-guide/
- Judging guide: https://www.spaceappschallenge.org/resources/judging-awards-guide/
- FIRMS: https://www.earthdata.nasa.gov/data/tools/firms
- FIRMS Area API: https://firms.modaps.eosdis.nasa.gov/api/area/
- FIRMS country archives: https://firms.modaps.eosdis.nasa.gov/country/
- FIRMS on the S-NPP transition: https://www.earthdata.nasa.gov/news/blog/transitioning-from-suomi-npp-viirs-omps-what-firms-users-need-know
- S-NPP cessation notice: https://www.earthdata.nasa.gov/data/alerts-outages/suomi-npp-observations-cease-november-2-2026
- MODIS to VIIRS transition, end dates: https://ladsweb.modaps.eosdis.nasa.gov/learn/modis-to-viirs-transition/
- NOAA-20 VIIRS 375 m NRT product: https://www.earthdata.nasa.gov/data/catalog/lancemodis-vj114imgtdl-nrt-2
- Schroeder et al. 2014 (VIIRS 375 m): https://earthdata.nasa.gov/s3fs-public/imported/Schroeder_et_al_2014b_RSE.pdf
- Li et al. 2018 (VIIRS vs MODIS FRP): https://repository.library.noaa.gov/view/noaa/49896
- Aqua drift: https://www.earthdata.nasa.gov/learn/articles/aqua-at-20
- Natural Earth: https://www.naturalearthdata.com/
- CONAE heat-spot catalog: https://catalogos5.conae.gov.ar/catalogofocos
