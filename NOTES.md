# Overpass build notes

Running log of what was checked against real FIRMS data, what was decided, and what a person
still has to look at. The final report goes at the top of this file when the build is done.

## Final report (15 Nov 2026, early morning)

### Deploy

The Vercel CLI is not installed on the build machine, so the site is not deployed yet. Steps:

1. https://vercel.com/new, import `github.com/Supposeduck30/overpass`.
2. Root directory `web`. Framework preset Vite (also set in `web/vercel.json`). Build command `npm run build`, output `dist`.
3. Environment variable `FIRMS_MAP_KEY` (Production and Preview). Without it every view still works from the committed data; live month-to-date and recent detections for a box say they are unavailable.
4. Deploy, then open `/?tour=1` and `/?v=evidence` to check the live site.

### Headline numbers

The record runs from Nov 2000 (Terra) through Aqua (Aug 2002), S-NPP (Feb 2012) and NOAA-20 (Nov 2026), for 10 regions. Hero regions are Córdoba and California.

| Region | Aqua→S-NPP model, held-out error | One global factor | Exchange rate | 2012 step, recorded | 2012 step, harmonized (90%) | Coverage, backward / forward | Terra total as % of Aqua, 2002–2011 | Forecast | Top five years |
|---|---|---|---|---|---|---|---|---|---|
| Córdoba | M3 12.2% | 24.6% | ×3.55 | ×2.51 | ×0.84 (0.65–1.08) | 85% / 94% | 99% | shown | 2003, 2004, 2006, 2005, 2008 |
| California | M3 13.4% | 32.0% | ×4.07 | ×3.63 | ×0.90 (0.71–1.14) | 79% / 69% | 98% | not shown | 2020, 2021, 2008, 2017, 2018 |
| Portugal | M4 19.7% | 37.2% | ×4.27 | ×3.58 | ×0.94 (0.58–1.53) | 89% / 94% | 105% | shown | 2005, 2017, 2003, 2009, 2012 |
| Punjab–Haryana | M4 17.8% | 55.1% | ×6.92 | ×4.73 | ×1.13 (0.81–1.58) | 83% / 69% | 105% | shown | 2016, 2007, 2009, 2012, 2005 |
| Central Kalimantan | M3 15.0% | 42.1% | ×5.33 | ×4.37 | ×1.05 (0.62–1.76) | 94% / 86% | 91% | shown | 2006, 2015, 2004, 2009, 2014 |
| Zambia | M4 14.6% | 41.3% | ×6.88 | ×4.78 | ×1.13 (0.85–1.51) | 94% / 78% | 101% | not shown | 2005, 2013, 2012, 2016, 2019 |
| Mato Grosso | M0 20.5% | 20.5% | ×2.65 | ×2.80 | ×1.07 (0.77–1.48) | 98% / 86% | 89% | shown | 2004, 2007, 2003, 2005, 2010 |
| Southeast Australia | M3 16.5% | 37.9% | ×4.19 | ×5.18 | ×1.20 (0.94–1.51) | 85% / 75% | 91% | not shown | 2017, 2006, 2011, 2019, 2018 |
| Alberta | M3 14.5% | 50.9% | ×5.90 | ×5.57 | ×0.94 (0.75–1.18) | 85% / 94% | 96% | not shown | 2023, 2015, 2021, 2018, 2003 |
| Central Sakha | M4 22.3% | 57.0% | ×3.30 | ×3.88 | ×0.72 (0.38–1.35) | 98% / 94% | 101% | shown | 2021, 2020, 2011, 2012, 2014 |

NOAA-20 reads 1 to 7% above S-NPP in every region, so link 2 is a factor everywhere (0.93 to 0.97).

### Which claims held

- Held: the raw record jumps at the 2012 satellite change in every region (×2.5 to ×5.6), and harmonized it does not: all 10 harmonized step intervals include ×1.
- Held in 9 of 10: a regional model beats one global factor. In Mato Grosso the global factor was kept because M4 did not win consistently enough under the selection rule.
- Held, as a new check: Terra and Aqua, translated separately, give 2002–2011 totals within 11% of each other in every region (89% to 105%).
- Held with the §15 fallback: 90% intervals. Coverage was short in several links and was widened from held-out residuals; split tests still fall short in California (79% / 69%), Punjab (69% forward), Zambia (78%) and Southeast Australia (75%). The Evidence view says so for each.
- Did not hold: "NOAA-20 is interchangeable with S-NPP". A factor beats identity in every region.
- Did not hold: "fire-days 0.25° is the steadiest unit". It is close to the steadiest but not the steadiest in most regions; the unit was kept and the Evidence view shows it.
- Mixed: Aqua's drift is measured in every region (+100 to +130 minutes by 2026). A clear effect on the S-NPP to Aqua ratio only in Punjab; calibration stays on 2012–2020 everywhere.
- Not testable yet: a step at the Nov 2026 handoff (no NOAA-20-only month exists). The 2020–2026 overlap stands in.
- Open: Pettitt still finds a harmonized change point in 7 regions. Aqua alone agrees on the date in Córdoba, Portugal, Kalimantan and Southeast Australia (change in burning). It disagrees in California, Mato Grosso and Sakha; in Sakha the harmonized break (Oct 2012) sits next to the handoff, so a leftover seam there cannot be ruled out. The app says this per region.
- Forecast: beats the normal month in 6 of 10 regions and is shown only there. In Sakha it is shown but only just (84.3% against 89.4%), and in Kalimantan it loses to persistence; Evidence shows all three bars.

### Cut

Built from the stretch list: Terra extension, forecast, Ask. Cut: Fire Helix (the spec gives it
no design beyond "only if everything else is done and checked") and Spanish (not in the spec;
every string would need a second copy reviewed by a speaker).

### A person must check

- Every region box in `pipeline/config.yaml`, and that clipping to the country outline is what the team wants (see the decision on Portugal below).
- The top five fire years per region (table above) against local knowledge. Calendar years split some seasons (Southeast Australia's 2019–20 Black Summer; Alberta 2016 Fort McMurray is not in its top five by fire-days).
- `REFERENCES.md`: paper citations were written from memory of the literature and need checking against the originals.
- Whether the Pettitt reading for Córdoba (less burning after 2012) matches local records.
- Ask, once `LLM_API_KEY` is set: it has not been run against the model.

### Usability pass (desktop, from a fresh visit)

| Task | Path | Clicks |
|---|---|---|
| Why does 2012 look odd? | First screen: the finding sentence ("Raw counts jump 2.5 times at the 2012 satellite change") and the labelled dashed rule; Harmonized removes it | 0 (1 to see it go) |
| Which month usually burns most? | Calendar's median-by-month bars and underlined fire-season months on the first screen; Season for the dial | 0 (1) |
| Is this month unusual? | This month | 1 |
| CSV for a drawn box | Area, Draw a box, drag, Download hotspots CSV | 3 and a drag |
| Proof the method works | Evidence | 1 |

Keyboard: skip link first, then every control in order with a 2 px focus outline; `1`–`5`, `a`, `t`, `?`, `/` and Esc work when focus is not in a field. axe-core (WCAG 2 A/AA and best practice) reports no violations on every view and drawer at 1440 and 375 px after the fixes in this build.

### Production build

Initial load: `index` 254.9 kB (81.3 kB gzip) plus 12.7 kB CSS and fonts. Lazy chunks: Scenes 1,229 kB (327 kB gzip; three.js and deck.gl), map style 1,058 kB (289 kB gzip; MapLibre, loaded with Area or the flyover), Evidence 30 kB, This month 11 kB. `web/public/data` is 69 MB for 10 regions; hotspot CSVs are kept for Córdoba, California, Portugal and Punjab and left out for the other six to stay under 80 MB (the download button says so).

`git log -p` checked for the FIRMS key and any LLM key: none found. No `.env`, `pipeline/data/` or `node_modules` file is tracked.

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
- Scenes: phones start on the flat twin and reach the terrain through "View in 3D"; desktop keeps the choice in the URL. A browser that cannot start WebGL stays on the flat twin and says why.
- Column Flyover opens on the record's busiest month when the URL names none. The selected cell is view state and is not written to the URL.
- Cliff Melt glow is a threshold bloom pass over the whole frame rather than a selective one; only the brightest ridges pass the threshold.
- Frame time while orbiting Cliff Melt at 1440 px on Intel Iris Xe (headless Chrome, D3D11): median 16.7 ms, 95th percentile 16.8 ms. The scene renders on demand, so it draws nothing while still.
- Every region is its box cut to its country. Found on Portugal: the box takes in part of Spain, the per-country archives did not, and NOAA-20 (Area API, whole box) read 47% above S-NPP in 2020 to 2025. After the clip the NOAA-20 to S-NPP factor there is 0.93, in line with Córdoba and California. California lost a strip of Mexico the same way (18,421 raw rows); Córdoba is unchanged. A human should still check each box.
- Hotspot downloads are written with a fixed gzip header so an unchanged year is byte-identical between runs.
- FIRMS reports a spent transaction budget as HTTP 400 or 401 "Invalid MAP_KEY." rather than 429. `fetch.py` now checks the key's status on that answer and waits, instead of failing the region.
- Terra extension built. A third link translates Terra MODIS into S-NPP units (same ladder, same 2012–2020 window) and carries the record from Nov 2000 until Aqua's first full month, Aug 2002; Jul 2002 now comes from Terra instead of a partial Aqua month. Check: Terra and Aqua were each translated on their own for Aug 2002 to Dec 2011, years neither link saw. Terra's total is 114% of Aqua's in Córdoba (whose Terra link fell back to the pooled factor M0), 98% in California, 105% in Portugal and Punjab. Shown in the Methods drawer as computed.
- Terra was down 15 June to 2 July 2001 and 19 to 27 March 2002 (no detections anywhere in Córdoba or Portugal on those days; California and Portugal show the same gaps). Those months are marked partial and kept out of normals, tests and month-to-date comparisons. Listed in `config.yaml` under `outages`.
- Punjab–Haryana is in. Aqua to S-NPP: M4, 17.8% against 50.0% for one factor; exchange ×6.92. Raw step at 2012 ×4.73, harmonized ×1.13 (0.81–1.58). Unlike the other regions, the S-NPP to Aqua ratio left its 2012–2020 range in all 5 years since 2022: Aqua's later overpass does change what it sees here (crop-residue fires are timed through the afternoon). Calibration stays on 2012–2020, which is the §15 fallback, and the app says the drift has an effect here.
- Forecast built (stretch). Quantile gradient boosting predicts the month after the one in progress (two months ahead of the last full month) from the calendar month, its past-only normal and the last three anomalies; refitted once a year in the 2016–2025 backtest. Typical miss against the normal month: Córdoba 25.8% vs 45.9%, Portugal 56.6% vs 64.1%, Punjab 26.2% vs 29.7%: shown. California 22.2% vs 20.2%: not shown, and This month and Evidence say so. Raw backtest interval coverage was 78–85%; where under 85% the ranges are widened by the same conformal rule as the translations, and the app states the factor.
- Ask built (stretch): `web/api/chat.ts` uses the Anthropic TypeScript SDK with a manual tool loop over five tools that read the site's own JSON (list_regions, get_monthly, get_month_status, get_season_clock, get_validation), effort `low`, 2,000 output tokens per step, at most 6 steps, 12 questions per address per 10 minutes per instance, and server-side fallback on a refusal. The Ask button renders only when `GET /api/chat` reports a key. The tools are tested against the real data files (`web/api/chat.test.ts`); the model call itself was not run because no `LLM_API_KEY` was available during the build. A person should ask it the five usability questions once a key is set and check each number against the views.
- Central Kalimantan is in. Aqua to S-NPP: M3, 15.0% against 33.6% for one factor; exchange ×5.33. Raw step at 2012 ×4.37, harmonized ×1.05 (0.62–1.76). Top years 2006, 2015, 2004, 2009, 2014, the known El Niño fire years. Its forecast beats the normal month (51.7% against 97.4%) but not persistence (47.3%); it is shown under the beats-the-normal rule and Evidence shows all three bars.
- Zambia is in. Its box took in parts of neighbouring countries (53% inside Zambia; 6.5 million raw rows outside were dropped). Aqua to S-NPP: M4, 14.6% against 42.9% for one factor; exchange ×6.88. Raw step at 2012 ×4.78, harmonized ×1.13 (0.85–1.51). Terra and Aqua agree within 1% on 2002–2011. Forecast: 28.7% against 22.6% for the normal month, not shown. With six regions the data folder passed 80 MB, so the export dropped the hotspot CSVs of Kalimantan and Zambia (the app says so on the download button); their monthly CSVs and every view remain.
- Mato Grosso is in. Here one global factor (M0, 20.0%) was kept: M4 scored 17.7% but did not win in 90% of paired resamples, so the simpler rung stands. This is the first region where a regional model does not beat the global factor. Raw step ×2.80, harmonized ×1.06 (0.77–1.47). Top years 2004, 2007, 2003, 2005, 2010. Pettitt puts the harmonized change point at 2009-04 and Aqua alone at 2007-11, so the single-instrument check is inconclusive and the app says so.
- Southeast Australia is in. M3, 16.5% against 37.5%; raw step ×5.18, harmonized ×1.20 (0.94–1.51). Top calendar years 2017, 2006, 2011, 2019, 2018: the 2019–20 Black Summer is split across two calendar years, so a person should read this list with that in mind. Forward-test coverage 75%.
