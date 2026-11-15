# Overpass

One fire record from November 2000 to today, across four satellites.

Overpass is the Overpass team's entry for the NASA Space Apps Challenge 2026, "Harmonization of
MODIS and VIIRS Hot Spots". Terra and Aqua MODIS, S-NPP VIIRS and NOAA-20 VIIRS see very different numbers
of fires for the same burning, so their records cannot be joined end to end. Overpass translates
the older and the newer records into what S-NPP VIIRS would have counted, using the years when
two satellites flew together, and checks every translation on years it was not fitted on.

The app shows a burning-activity calendar for each prepared region, the current month against
its normal, the fire season's timing, the evidence for and against the method, and two 3D scenes.
Monthly series, hotspots and validation results download as CSV or JSON, for a whole region or a
drawn box.

## Run it

Web app (Node 20 or later):

```
cd web
npm install
npm run dev          # http://localhost:5173
npm run build        # type check, tests, production build into web/dist
```

The committed files in `web/public/data/` are enough to run every view. Live month-to-date
numbers and recent detections for any box need a FIRMS map key on the server: copy
`web/.env.example` to `web/.env.local` and set `FIRMS_MAP_KEY`. Free keys:
https://firms.modaps.eosdis.nasa.gov/api/map_key/

Pipeline (Python 3.11):

```
cd pipeline
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt     # .venv/bin/pip on macOS and Linux
cp .env.example .env                              # then set FIRMS_MAP_KEY
.venv/Scripts/python run_all.py --region cordoba  # fetch to export for one region
.venv/Scripts/python run_all.py --all --from-stage calibrate
.venv/Scripts/python -m pytest tests
```

Stages, in order: fetch, clean, grid, aggregate, calibrate, validate, clock, nowcast, export.
`--from-stage` and `--to-stage` run part of the chain. Raw downloads go to `pipeline/data/`,
which is not committed; a re-run skips anything already fetched.

## Deploy

The web app deploys to Vercel as a Vite project with `web/` as the root directory. Set
`FIRMS_MAP_KEY` in the project's environment variables so `web/api/firms.ts` can call FIRMS.
Without it every view still works from the committed data, and the live parts say they are
unavailable.

## How the method works, in short

- Unit: fire-days, one 0.25° cell on one local solar date with at least one qualifying detection.
- Translation: five candidate models per link, from one shared factor to quantile mapping, chosen
  by leave-one-year-out error. A more complex model must beat the simpler one by more than 5%.
- Intervals: 90% prediction intervals, widened by split-conformal adjustment where held-out
  coverage fell short.
- Checks: forward and backward hold-outs, step tests at each satellite change, Pettitt's
  change-point test with Aqua alone as a single-instrument control, and Aqua's orbit drift.

The Methods drawer in the app and `OVERPASS_CONTEXT.md` give the details. `NOTES.md` records what
was checked on real data and what was decided.

## Repository

```
pipeline/   Python: fetch FIRMS, clean, grid, calibrate, validate, export
web/        Vite, React and TypeScript app; web/public/data is written by the pipeline
REFERENCES.md   every dataset, library, font and paper used
```

## License

Apache-2.0. See `LICENSE`. Fire data from NASA FIRMS; outlines from Natural Earth. Overpass is a
student project and is not endorsed by NASA. It does not replace local fire authorities.
