import { scaleLinear } from "d3-scale";
import { useData } from "../../data/context";
import { PLATE, TOKENS } from "../../lib/color";
import { useWidth } from "../../lib/hooks";
import { Dial, formatHour } from "../../parts/Dial";
import { TableTwin, type Column } from "../../parts/TableTwin";
import { useUrl } from "../../state/url";
import type { DriftRow } from "../../types";
import { AxisBottom, AxisLeft, Figure, plateProps } from "./Figure";

const hour = (h: number | null) => (h == null ? "no data" : formatHour(h));

const TABLE: Column<DriftRow>[] = [
  { key: "year", label: "Year", value: (r) => r.year },
  { key: "terra", label: "Terra", value: (r) => r.terraLst, format: (r) => hour(r.terraLst) },
  { key: "aqua", label: "Aqua", value: (r) => r.aquaLst, format: (r) => hour(r.aquaLst) },
  { key: "snpp", label: "S-NPP", value: (r) => r.snppLst, format: (r) => hour(r.snppLst) },
  { key: "noaa20", label: "NOAA-20", value: (r) => r.noaa20Lst, format: (r) => hour(r.noaa20Lst) },
  { key: "ratio", label: "S-NPP fire-days per Aqua fire-day", value: (r) => r.ratio, format: (r) => r.ratio?.toFixed(2) ?? "no data" },
];

function RatioChart({ rows, selected, width, height }: { rows: DriftRow[]; selected: number; width: number; height: number }) {
  const { validation } = useData();
  const e = validation.driftEffect;
  const pts = rows.filter((r): r is DriftRow & { ratio: number; aquaLst: number } => r.ratio != null && r.aquaLst != null);
  if (pts.length < 2) return null;
  const pad = { l: 56, r: 24, t: 68, b: 56 };
  const xs = pts.map((p) => p.aquaLst);
  const band = e.baselineRatio != null && e.baselineSd != null ? [e.baselineRatio - 2 * e.baselineSd, e.baselineRatio + 2 * e.baselineSd] : null;
  const ys = [...pts.map((p) => p.ratio), ...(band ?? [])];
  const x = scaleLinear().domain([Math.min(...xs) - 0.1, Math.max(...xs) + 0.1]).range([pad.l, width - pad.r]);
  const y = scaleLinear().domain([Math.min(...ys), Math.max(...ys)]).nice().range([height - pad.b, pad.t]);
  return (
    <svg {...plateProps(width, height, "S-NPP fire-days per Aqua fire-day in each year, against Aqua's measured overpass time. The table below has the numbers.")}>
      <rect width={width} height={height} fill={TOKENS.night} />
      <text x={16} y={24} fontSize={15} fontWeight={600} fill={PLATE.ink}>S-NPP fire-days per Aqua fire-day, by year</text>
      {band && <text x={16} y={44} fontSize={13} fill={PLATE.soft}>Shaded: the usual range, 2012 to 2020</text>}
      {band && (
        <>
          <rect x={pad.l} width={width - pad.l - pad.r} y={y(band[1])} height={y(band[0]) - y(band[1])} fill={TOKENS.chalk} fillOpacity={0.12} />
          <line x1={pad.l} x2={width - pad.r} y1={y(e.baselineRatio!)} y2={y(e.baselineRatio!)} stroke={TOKENS.chalk} strokeOpacity={0.5} strokeDasharray="5 4" />
        </>
      )}
      <AxisLeft scale={y} ticks={y.ticks(4)} x={pad.l} format={(v) => v.toFixed(1)} />
      <AxisBottom scale={x} ticks={x.ticks(width < 420 ? 3 : 5)} y={height - pad.b} format={formatHour} />
      <text x={(pad.l + width - pad.r) / 2} y={height - 12} fontSize={13} textAnchor="middle" fill={PLATE.soft}>Aqua's measured overpass, local solar time</text>
      {[...pts].sort((a, b) => Number(a.year === selected) - Number(b.year === selected)).map((p) => {
        const on = p.year === selected;
        return (
          <g key={p.year}>
            <circle cx={x(p.aquaLst)} cy={y(p.ratio)} r={on ? 7 : 4} fill={on ? TOKENS.chalk : TOKENS.night} stroke={TOKENS.chalk} strokeWidth={1.5} />
            {(on || p.year >= 2022) && <text x={x(p.aquaLst)} y={y(p.ratio) - 12} fontSize={13} fontWeight={on ? 700 : 400} textAnchor="middle" fill={PLATE.ink}>{p.year}</text>}
          </g>
        );
      })}
    </svg>
  );
}

export function DialFigure() {
  const { validation } = useData();
  const [url, setUrl] = useUrl();
  const [wrap, width] = useWidth<HTMLDivElement>(1000);
  const rows = validation.drift.filter((r) => r.aquaLst != null || r.snppLst != null || r.terraLst != null);
  if (!rows.length) return null;
  const first = rows[0].year;
  const last = rows[rows.length - 1].year;
  const year = url.year != null && url.year >= first && url.year <= last ? url.year : last;
  const row = rows.find((r) => r.year === year) ?? rows[rows.length - 1];
  const e = validation.driftEffect;

  const moved = e.aquaLatestShiftMinutes != null ? `Aqua now passes ${Math.abs(Math.round(e.aquaLatestShiftMinutes))} minutes ${e.aquaLatestShiftMinutes >= 0 ? "later" : "earlier"} than it did in 2012 to 2020` : "Aqua's overpass time has been measured for every year";
  const effect = e.detected == null
    ? "there are too few years to say whether that changed what it counts"
    : e.detected
      ? `the S-NPP to Aqua ratio left its usual range in ${e.lateYearsOutside} of ${e.lateYears} years since 2022`
      : `the S-NPP to Aqua ratio stayed in its usual range in ${e.lateYears! - e.lateYearsOutside!} of ${e.lateYears} years since 2022`;
  const finding = `${moved}, and ${effect}.`;

  const stacked = width < 820;
  const dialSize = stacked ? Math.min(width, 420) : Math.min(440, Math.floor(width * 0.42));
  const chartW = stacked ? width : width - dialSize;

  return (
    <Figure n={5} id="dial" finding={finding}
      how="The ring is a 24-hour clock in local solar time with noon at the top. Each arc covers the middle half of one satellite's daytime overpass times in the chosen year, measured from its own detections, with a tick at the median. Move the year to watch Aqua slide later. The chart beside it asks whether that mattered: each dot is one year, placed by Aqua's overpass time and by how many fire-days S-NPP counted for each of Aqua's."
      mind={e.detected ? "The ratio returning to its 2012 to 2020 range while Aqua keeps drifting would mean the shift was something else." : "Most of the years since 2022 falling outside the shaded range, in the direction the drift predicts, would mean Aqua needs a drift correction before it can anchor anything after 2021."}>
      <div className="field figure-year">
        <label className="label" htmlFor="dial-year">Year on the dial</label>
        <input id="dial-year" type="range" min={first} max={last} step={1} value={year}
          onChange={(ev) => setUrl({ year: Number(ev.target.value) })} />
        <output htmlFor="dial-year">{year}</output>
      </div>
      <div ref={wrap} className={`plate figure-dial${stacked ? " figure-dial-stacked" : ""}`}>
        <Dial row={row} size={dialSize} />
        <RatioChart rows={rows} selected={year} width={chartW} height={stacked ? 320 : dialSize} />
      </div>
      <p className="figure-note">
        Overpass times are the medians of daytime detections in this region, converted to local solar time; they are measured, not taken from a published orbit.
        The usual range is the 2012 to 2020 mean, {e.baselineRatio?.toFixed(2) ?? "no data"}, plus or minus two standard deviations. Aqua does not feed the record after 2012, so drift cannot move the harmonized series; it matters for the Aqua-only checks.
      </p>
      <TableTwin caption="Median daytime overpass time by satellite and year, local solar time" columns={TABLE} rows={rows} collapsible />
    </Figure>
  );
}
