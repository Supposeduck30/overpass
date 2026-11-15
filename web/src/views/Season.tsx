import { scaleLinear } from "d3-scale";
import { useState } from "react";
import { useData } from "../data/context";
import { loadClock, useLoad } from "../data/load";
import { PLATE, TOKENS } from "../lib/color";
import { count, MONTHS, pValue, SAT_NAMES, signed } from "../lib/format";
import { useWidth } from "../lib/hooks";
import { median } from "../lib/series";
import { Finding, Waiting } from "../parts/Finding";
import { Readout } from "../parts/Readout";
import { TableTwin, type Column } from "../parts/TableTwin";
import type { Clock, ClockYear, Mark, Trend } from "../types";
import "./Season.css";

type Key = Mark | "length";

const KEYS: Key[] = ["onset", "peak", "end", "length"];
const NAMES: Record<Key, string> = { onset: "Onset (10% of the year's fire-days)", peak: "Midpoint (50%)", end: "End (90%)", length: "Length (onset to end)" };
const SHORT: Record<Mark, string> = { onset: "onset", peak: "midpoint", end: "end" };
/** Mean gap in days between two satellites' dates below which a mark is treated as comparable (pipeline/clock.py). */
const COMPARABLE_DAYS = 7;

/** Calendar date of a 1-based day of a fire year, as "14 Jul". */
function dayLabel(fireYear: number, startMonth: number, day: number): string {
  const d = new Date(Date.UTC(fireYear, startMonth - 1, day));
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

function interval(t: Trend): string {
  return `${signed(t.daysPerDecade, 1)} days per decade (${signed(t.lo, 1)} to ${signed(t.hi, 1)}, ${pValue(t.p)})`;
}

const clear = (t: Trend) => t.p < 0.05 && (t.lo > 0 || t.hi < 0);

function verdict(t: Trend | null, gap: number | undefined): string {
  if (!t) return "Too few complete fire years";
  if (!clear(t)) return "Not a clear trend";
  if (t.comparable === false) return `Not comparable across satellites${gap != null ? `: their dates differ by ${gap.toFixed(0)} days` : ""}`;
  return "Clear trend";
}

interface TrendRow {
  key: Key;
  stitched: Trend | null;
  aqua: Trend | null;
  gap: number | undefined;
}

function Trends({ rows }: { rows: TrendRow[] }) {
  return (
    <table className="season-trends">
      <caption className="sr-only">Trend in each season mark, days per decade with 95% interval and p-value</caption>
      <thead>
        <tr><th scope="col">Season mark</th><th scope="col">Stitched record</th><th scope="col">Aqua alone, one instrument</th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <th scope="row">{NAMES[r.key]}</th>
            <td data-label="Stitched record">{r.stitched ? `${interval(r.stitched)}. ` : ""}<strong>{verdict(r.stitched, r.gap)}.</strong></td>
            <td data-label="Aqua alone">{r.aqua ? `${interval(r.aqua)}. ` : ""}<strong>{verdict(r.aqua, undefined)}.</strong></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function headline(clock: Clock, region: string): string {
  const t = clock.trend.peak;
  if (!t) return `${region} has too few complete fire years to estimate a trend in season timing.`;
  const dir = t.daysPerDecade >= 0 ? "later" : "earlier";
  const head = `The midpoint of ${region}'s fire season has moved ${Math.abs(t.daysPerDecade).toFixed(1)} days ${dir} per decade (${signed(t.lo, 1)} to ${signed(t.hi, 1)}, ${pValue(t.p)}).`;
  if (!clear(t)) return `${head} Not a clear trend.`;
  return t.comparable === false ? `${head} The satellites disagree on this date, so the trend may be an artifact.` : head;
}

function Plate({ clock, width, active, onActive }: { clock: Clock; width: number; active: number | null; onActive: (y: number | null) => void }) {
  const years = clock.years;
  const compact = width < 600;
  const rowH = compact ? 18 : 20;
  const pad = { l: 56, r: compact ? 16 : 132, t: 44, b: 16 };
  const height = pad.t + years.length * rowH + pad.b;
  const start = clock.fireYearStartMonth;
  const x = scaleLinear().domain([1, 366]).range([pad.l, width - pad.r]);
  const rowY = (i: number) => pad.t + i * rowH + rowH / 2;
  const firstOf = Array.from({ length: 12 }, (_, i) => ({
    label: MONTHS[(start - 1 + i) % 12],
    day: Math.round((Date.UTC(2001, start - 1 + i, 1) - Date.UTC(2001, start - 1, 1)) / 86400000) + 1,
  }));

  const lines = (["onset", "peak", "end"] as Mark[]).flatMap((k) => {
    const t = clock.trend[k];
    if (!t) return [];
    const slope = t.daysPerDecade / 10;
    const b = median(years.map((y) => y[k] - slope * y.fireYear));
    const at = (y: ClockYear) => x(b + slope * y.fireYear);
    return [{ k, x0: at(years[0]), x1: at(years[years.length - 1]) }];
  });

  return (
    <svg width={width} height={height} role="img" fontFamily={PLATE.font} style={{ display: "block", fontVariantNumeric: "tabular-nums" }}
      aria-label={`Fire season timing by fire year, ${years[0].fireYear} to ${years[years.length - 1].fireYear}. The table below has the numbers.`}
      onMouseLeave={() => onActive(null)}>
      <rect width={width} height={height} fill={TOKENS.night} />
      {firstOf.map((m, i) => (
        <g key={m.label}>
          <line x1={x(m.day)} x2={x(m.day)} y1={pad.t - 8} y2={height - pad.b} stroke={PLATE.rule} strokeOpacity={0.25} />
          {(!compact || i % 2 === 0) && <text x={x(m.day) + 4} y={pad.t - 14} fontSize={13} fill={PLATE.soft}>{m.label}</text>}
        </g>
      ))}
      {years.map((y, i) => {
        const prev = years[i - 1];
        const on = active === y.fireYear;
        const cy = rowY(i);
        return (
          <g key={y.fireYear} onMouseEnter={() => onActive(y.fireYear)} onClick={() => onActive(y.fireYear)}>
            {prev && prev.sat !== y.sat && (
              <>
                <line x1={pad.l} x2={width - pad.r} y1={cy - rowH / 2} y2={cy - rowH / 2} stroke={TOKENS.chalk} strokeOpacity={0.5} strokeDasharray="5 4" />
                {compact
                  ? <text x={width - 6} y={cy - rowH / 2 - 4} fontSize={13} textAnchor="end" fill={PLATE.ink} stroke={TOKENS.night} strokeWidth={4} paintOrder="stroke">{SAT_NAMES[y.sat]} from {y.fireYear}</text>
                  : <text x={width - pad.r + 8} y={cy + 4} fontSize={13} fill={PLATE.ink}>{SAT_NAMES[y.sat]} from {y.fireYear}</text>}
              </>
            )}
            <rect x={0} y={cy - rowH / 2} width={width} height={rowH} fill={TOKENS.chalk} fillOpacity={on ? 0.1 : 0} />
            <text x={pad.l - 10} y={cy + 4} fontSize={13} textAnchor="end" fontWeight={on ? 700 : 400} fill={on ? PLATE.ink : PLATE.soft}>{y.fireYear}</text>
            <line x1={x(y.onset)} x2={x(y.end)} y1={cy} y2={cy} stroke={TOKENS.chalk} strokeOpacity={on ? 1 : 0.6} strokeWidth={compact ? 5 : 6} />
            <circle cx={x(y.peak)} cy={cy} r={compact ? 4.5 : 5} fill={TOKENS.night} stroke={TOKENS.chalk} strokeWidth={2} />
          </g>
        );
      })}
      {lines.map((l) => (
        <g key={l.k} pointerEvents="none">
          <line x1={l.x0} x2={l.x1} y1={rowY(0)} y2={rowY(years.length - 1)} stroke={TOKENS.lightBlue} strokeWidth={1.5} />
          <text x={l.x1} y={height - 2} fontSize={13} textAnchor="middle" fill={TOKENS.lightBlue}>{SHORT[l.k]}</text>
        </g>
      ))}
    </svg>
  );
}

function SeasonBody({ clock }: { clock: Clock }) {
  const { region } = useData();
  const [wrap, width] = useWidth<HTMLDivElement>(1000);
  const [active, setActive] = useState<number | null>(null);
  const start = clock.fireYearStartMonth;
  const o = clock.overlapCheck;
  const gaps: Record<Key, number | undefined> = { onset: o.onsetDays, peak: o.peakDays, end: o.endDays, length: Math.max(o.onsetDays ?? 0, o.endDays ?? 0) || undefined };
  const trends: TrendRow[] = KEYS.map((key) => ({ key, stitched: clock.trend[key], aqua: clock.trendAquaOnly[key], gap: gaps[key] }));
  const hovered = clock.years.find((y) => y.fireYear === active);
  const date = (y: ClockYear, k: Mark) => dayLabel(y.fireYear, start, y[k]);
  const suspect = trends.filter((t) => t.stitched && clear(t.stitched) && t.stitched.comparable === false);

  const yearTable: Column<ClockYear>[] = [
    { key: "fy", label: `Fire year (starts ${MONTHS[start - 1]})`, value: (r) => r.fireYear },
    { key: "onset", label: "Onset", value: (r) => r.onset, format: (r) => date(r, "onset") },
    { key: "peak", label: "Midpoint", value: (r) => r.peak, format: (r) => date(r, "peak") },
    { key: "end", label: "End", value: (r) => r.end, format: (r) => date(r, "end") },
    { key: "len", label: "Length, days", value: (r) => r.end - r.onset },
    { key: "total", label: "Harmonized fire-days", value: (r) => r.total, format: (r) => count(r.total == null ? null : Math.round(r.total)) },
    { key: "sat", label: "Dates from", value: (r) => SAT_NAMES[r.sat] },
  ];

  if (!clock.years.length) {
    return <Finding how="Season timing needs at least one complete fire year with enough burning.">{`${region.name} has no complete fire year with enough burning to time a season.`}</Finding>;
  }

  return (
    <section className="season-view" aria-label="Season timing">
      <Finding title="The fire season" how={`Each row is one fire year, starting in ${MONTHS[start - 1]}. The bar runs from the day 10% of that year's fire-days had been counted to the day 90% had; the ring marks the day half had. The mint lines are the fitted trends in each date. A dashed rule marks where the dates start coming from a different satellite.`}>
        {headline(clock, region.name)}
      </Finding>
      <div className="plot-surface">
        <div className="plot-label">Timing by fire year <span>Fire year starts in {MONTHS[start - 1]}</span></div>
        <div ref={wrap} className="plate season-plate">
          <Plate clock={clock} width={width} active={active} onActive={setActive} />
        </div>
      </div>
      <Readout hint={width < 600 ? "Tap a row to read that fire year." : "Point at a row to read that fire year."}>
        {hovered
          ? `Fire year ${hovered.fireYear}: a tenth of its fire-days by ${date(hovered, "onset")}, half by ${date(hovered, "peak")}, nine tenths by ${date(hovered, "end")}. ${hovered.total == null ? "" : `${count(Math.round(hovered.total))} harmonized fire-days. `}Dates from ${SAT_NAMES[hovered.sat]}.`
          : null}
      </Readout>

      <div className="season-summary">
        <h2 className="season-sub">Trends in each date, on the stitched record and on Aqua alone</h2>
        <Trends rows={trends} />
        <p className="season-note">
          {o.meanAbsDiffDays == null
            ? "Aqua and S-NPP share no complete fire years here, so there is no check on whether their season dates agree."
            : `Overlap check: in the ${o.years.length} fire years both Aqua and S-NPP saw whole (${o.years[0]} to ${o.years[o.years.length - 1]}), their dates differed on average by ${o.onsetDays?.toFixed(0) ?? "no data"} days at onset, ${o.peakDays?.toFixed(0) ?? "no data"} at the midpoint and ${o.endDays?.toFixed(0) ?? "no data"} at the end. A date is treated as comparable across the handoff when that gap is ${COMPARABLE_DAYS} days or less.`}
          {suspect.length > 0 && ` The stitched ${suspect.length === 1 ? "trend" : "trends"} in ${suspect.map((t) => NAMES[t.key].split(" (")[0].toLowerCase()).join(" and ")} ${suspect.length === 1 ? "fails" : "fail"} that check, so ${suspect.length === 1 ? "its" : "their"} size may come from the change of satellite in 2012 and not from the ground. Read the Aqua-alone column for ${suspect.length === 1 ? "that mark" : "those marks"}.`}
        </p>
        <TableTwin caption={`Season dates by fire year in ${region.name}`} columns={yearTable} rows={clock.years} collapsible />
      </div>
    </section>
  );
}

export default function Season() {
  const { region } = useData();
  const clock = useLoad(`clock:${region.id}`, () => loadClock(region.id));
  if (clock.state !== "ready") return <Waiting what="Season" error={clock.state === "error" ? clock.message : undefined} />;
  return <SeasonBody clock={clock.data} />;
}
