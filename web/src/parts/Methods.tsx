import { useData } from "../data/context";
import { count, monthLabel, percent, utcStamp } from "../lib/format";
import { useUrl } from "../state/url";
import type { Link } from "../types";
import "./Methods.css";

const MODEL_WORDS: Record<string, string> = {
  identity: "no change (the two satellites count alike)",
  M0: "one factor shared by every prepared region",
  M1: "one factor for this region",
  M2: "one factor inside the fire season and another outside it",
  M3: "a log-linear curve, so sparse and busy months get different rates",
  M4: "quantile mapping on the overlap years",
};

function linkLine(link: Link): string {
  const { rate, lo, hi, atSourceCount } = link.exchange;
  return `${link.model}: ${MODEL_WORDS[link.model] ?? link.model}. Fitted on ${link.fit.replace("..", " to ")}. At ${count(atSourceCount)} source fire-days a month the rate is ×${rate.toFixed(2)} (${lo.toFixed(2)}–${hi.toFixed(2)}). Held-out 90% intervals covered ${percent(link.coverage90)} of months.`;
}

export function Methods() {
  const [, setUrl] = useUrl();
  const { region, monthly, validation, meta } = useData();
  const first = monthly.months[0].ym;
  const firstSnpp = monthly.months.find((m) => m.source === "snpp")?.ym;
  const firstNoaa = monthly.months.find((m) => m.source === "noaa20-translated")?.ym;

  return (
    <div className="methods">
      <p>
        Three satellites have watched {region.name} for fire since {monthLabel(first)}. They see different numbers of
        fires for the same burning, so their counts cannot be joined end to end. Overpass translates the older and the
        newer records into what S-NPP VIIRS would have counted, using the years when two satellites flew together.
      </p>

      <h3>The record</h3>
      <ul>
        <li>{monthLabel(first)} to {firstSnpp ? monthLabel(firstSnpp) : "today"}: Aqua MODIS, translated.</li>
        {firstSnpp && <li>{monthLabel(firstSnpp)} to {firstNoaa ? monthLabel(firstNoaa) : "today"}: S-NPP VIIRS, measured. No translation.</li>}
        {firstNoaa && <li>From {monthLabel(firstNoaa)}: NOAA-20 VIIRS, translated.</li>}
      </ul>

      <h3>The two translations</h3>
      <p><strong>Aqua to S-NPP.</strong> {linkLine(monthly.links.aqua_snpp)}</p>
      <p><strong>NOAA-20 to S-NPP.</strong> {linkLine(monthly.links.noaa20_snpp)}</p>
      <p>
        Each translation is chosen from five candidate models by leaving one year out at a time and predicting it. A
        more complex model is used only if it beats the simpler one by more than 5%.{" "}
        <button type="button" className="methods-link" onClick={() => setUrl({ v: "evidence", panel: null })}>See every test in Evidence</button>.
      </p>

      <h3>Definitions</h3>
      <dl>
        <dt>Region</dt>
        <dd>The part of the region's box that lies inside its country, so every satellite's record covers the same ground.</dd>
        <dt>Qualifying detection</dt>
        <dd>A vegetation-fire detection (type 0, or an untyped near-real-time detection away from known static heat sources) with MODIS confidence of 30 or more, or VIIRS confidence nominal or high.</dd>
        <dt>Fire-day</dt>
        <dd>One 0.25° grid cell (about 25 km) on one local solar date with at least one qualifying detection.</dd>
        <dt>Harmonized value</dt>
        <dd>Monthly fire-days as S-NPP VIIRS would have counted them.</dd>
        <dt>Interval</dt>
        <dd>The 90% prediction interval of a translated month. Measured months have none.</dd>
        <dt>Normal</dt>
        <dd>The median of all past same-calendar-months.</dd>
        <dt>So far this month</dt>
        <dd>Days 1 to d here against days 1 to d of each past same-month.</dd>
        <dt>Critical months</dt>
        <dd>The fewest months that together hold at least 60% of mean annual fire-days.</dd>
        <dt>Fire year</dt>
        <dd>Begins the month after the quietest month of the year.</dd>
        <dt>Exchange rate</dt>
        <dd>Harmonized divided by source count at the region's median burning month.</dd>
      </dl>

      <h3>Limits</h3>
      <ul>
        <li>Values for a drawn box are the region's total shared out by cell (70% by where the source satellite saw fire that month, 30% by where S-NPP usually sees it). They are an allocation, not a measurement.</li>
        <li>A fire-day says a cell burned on a day. It does not measure burned area or intensity.</li>
        <li>Cloud and smoke hide fires from every satellite here; nothing in this record corrects for that.</li>
        {validation.notes.map((n) => <li key={n}>{n}</li>)}
      </ul>

      <h3>Sources</h3>
      <p>
        Active fire detections: NASA FIRMS, MODIS Collection 6.1 (Terra, Aqua) and VIIRS 375 m (S-NPP, NOAA-20,
        NOAA-21), standard-quality archive where it exists and near-real-time after it. Coastlines and borders:
        Natural Earth. Overpass is a student project and is not endorsed by NASA.
      </p>
      <table className="data">
        <caption className="sr-only">Date range FIRMS reported for each product when the data was fetched</caption>
        <thead><tr><th scope="col">FIRMS product</th><th scope="col">From</th><th scope="col">To</th></tr></thead>
        <tbody>
          {meta.availability.map((a) => <tr key={a.data_id}><td>{a.data_id}</td><td>{a.min_date}</td><td>{a.max_date}</td></tr>)}
        </tbody>
      </table>
      <p className="fine">Data built {utcStamp(meta.builtAt)} from commit {meta.commit || "unknown"}.</p>
    </div>
  );
}
