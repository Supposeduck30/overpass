import { useMemo, useState } from "react";
import { useData } from "../data/context";
import { seamSteps } from "../data/guards";
import { inRange, useSelection } from "../data/selection";
import { diverging, sequential } from "../lib/color";
import { count, monthLabel, SAT_NAMES, sourceSat, times } from "../lib/format";
import { useIsMobile, useTween, useWidth } from "../lib/hooks";
import { median, yearTotals, type CellValue } from "../lib/series";
import { Finding, Waiting } from "../parts/Finding";
import { Readout } from "../parts/Readout";
import { TableTwin, type Column } from "../parts/TableTwin";
import { useUrl } from "../state/url";
import type { Validation } from "../types";
import { CalendarPlate } from "./CalendarPlate";
import { describe, handoffs, normalsAt } from "./calendarModel";
import "./Calendar.css";

function finding(months: CellValue[], mode: "h" | "r", px: boolean, boxed: boolean, validation: Validation): string {
  const years = yearTotals(months).filter((y) => y.complete);
  if (mode === "h" || boxed) {
    if (years.length < 3) return "Widen the year range to compare years.";
    const top = years.reduce((a, b) => (b.harmonized > a.harmonized ? b : a));
    const mid = median(years.map((y) => y.harmonized));
    const where = boxed ? "In your box, " : "";
    return `${where}${top.year} burned most: ${count(Math.round(top.harmonized))} fire-days, ${times(top.harmonized / mid)} the median year.`;
  }
  const seam = seamSteps(validation)[0];
  if (px || !seam) {
    const mean = (sat: string) => {
      const v = years.filter((y) => y.raw != null && months.some((m) => m.year === y.year && sourceSat(m.data.source) === sat && m.month === 6)).map((y) => y.raw!);
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    };
    const before = mean("aqua");
    const after = mean("snpp");
    if (!before || !after) return "Raw records, as each satellite counted them.";
    return `S-NPP records ${times(after / before)} as many ${px ? "detections" : "fire-days"} a year as Aqua did before it.`;
  }
  const gone = seam.harmonized.lo <= 0 && seam.harmonized.hi >= 0;
  const after = gone ? "Harmonized, no step remains." : `Harmonized, the step is ${times(Math.exp(seam.harmonized.step), 2)}.`;
  return `Raw counts jump ${times(Math.exp(seam.raw.step))} at the ${seam.ym.slice(0, 4)} satellite change. ${after}`;
}

const TABLE: Column<CellValue>[] = [
  { key: "ym", label: "Month", value: (m) => m.ym, format: (m) => monthLabel(m.ym) },
  { key: "h", label: "Harmonized fire-days", value: (m) => m.harmonized, format: (m) => count(m.harmonized) },
  { key: "lo", label: "Low", value: (m) => m.lo, format: (m) => count(m.lo) },
  { key: "hi", label: "High", value: (m) => m.hi, format: (m) => count(m.hi) },
  { key: "src", label: "Source", value: (m) => SAT_NAMES[sourceSat(m.data.source)], format: (m) => (m.translated ? `Translated from ${SAT_NAMES[sourceSat(m.data.source)]}` : "Measured by S-NPP") },
  { key: "raw", label: "Raw count", value: (m) => m.raw, format: (m) => (m.raw == null ? "not kept per cell" : count(m.raw)) },
  { key: "partial", label: "Full month", value: (m) => (m.partial ? "no" : "yes") },
];

export default function Calendar() {
  const [url, setUrl] = useUrl();
  const { region, validation, from, to } = useData();
  const sel = useSelection();
  const compact = useIsMobile();
  const [wrap, width] = useWidth<HTMLDivElement>(compact ? 343 : 1200);
  const [active, setActive] = useState<string | null>(null);

  const px = !sel.boxed && url.unit === "px";
  const mode = sel.boxed ? "h" : px ? "r" : url.mode;
  const k = useTween(mode === "h" ? 1 : 0, 900);

  const months = useMemo(() => inRange(sel.months, from, to), [sel.months, from, to]);
  const rules = useMemo(() => handoffs(sel.months), [sel.months]);
  const normals = useMemo(() => normalsAt(sel.months, mode === "h" ? 1 : 0), [sel.months, mode]);
  const scaleMax = useMemo(() => Math.max(1, ...sel.months.map((m) => Math.max(m.raw ?? 0, m.harmonized))), [sel.months]);

  if (sel.error) return <Waiting what="The box" error={`${sel.error} Clear the box from Area to go back to the whole region.`} />;
  if (sel.loading || !months.length) return <Waiting what="Calendar" />;

  const activeMonth = months.find((m) => m.ym === active);
  const last = sel.months[sel.months.length - 1];
  const unitWord = px ? "detections" : "fire-days";
  const why = sel.boxed
    ? `Your box holds ${sel.cellCount} grid cells with burning on record. Its values are the region's harmonized total shared out by cell, so only Harmonized is available.`
    : px
      ? "Detections are raw satellite pixel counts and cannot be put on one scale. Choose fire-days to use Harmonized."
      : "";

  return (
    <section className="calendar">
      <Finding how={<>Each row is a year and each column a month. Brighter means more {unitWord}; a fire-day is one grid cell of about 25 km with fire seen on one day. Dashed lines mark the months when the satellite behind the record changed. Hatched months are translated from an older satellite, with denser hatching where the translation is less certain.</>}>
        {finding(months, mode, px, sel.boxed, validation)}
      </Finding>

      <div className="calendar-controls">
        <div className="seg" role="group" aria-label="Record">
          <button type="button" className="btn" aria-pressed={mode === "r"} disabled={sel.boxed} onClick={() => setUrl({ mode: "r" })}>Raw records</button>
          <button type="button" className="btn" aria-pressed={mode === "h"} disabled={px} onClick={() => setUrl({ mode: "h" })}>Harmonized</button>
        </div>
        <div className="seg" role="group" aria-label="Color">
          <button type="button" className="btn" aria-pressed={url.color === "counts"} onClick={() => setUrl({ color: "counts" })}>Counts</button>
          <button type="button" className="btn" aria-pressed={url.color === "normal"} onClick={() => setUrl({ color: "normal" })}>Versus normal</button>
        </div>
        <label>
          <span className="sr-only">Unit</span>
          <select className="field" value={px ? "px" : "fd"} disabled={sel.boxed} onChange={(e) => setUrl({ unit: e.target.value as "fd" | "px" })}>
            <option value="fd">Fire-days</option>
            <option value="px">Detections (raw only)</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Color ramp</span>
          <select className="field" value={url.ramp} onChange={(e) => setUrl({ ramp: e.target.value as "cividis" | "greys" })}>
            <option value="cividis">Cividis ramp</option>
            <option value="greys">Greys ramp</option>
          </select>
        </label>
        <button type="button" className="btn" aria-pressed={url.table} onClick={() => setUrl({ table: !url.table })}>
          {url.table ? "Show calendar" : "Show table"}
        </button>
      </div>
      <p className="calendar-why fine">{why}</p>

      <div ref={wrap} className="calendar-plate">
        {url.table ? (
          <TableTwin caption={`Monthly record for ${region.name}`} columns={TABLE} rows={months} maxHeight={640} />
        ) : (
          <CalendarPlate months={months} record={sel.months} k={k} color={url.color} ramp={url.ramp} handoffs={rules}
            criticalMonths={region.criticalMonths} active={active} onActive={setActive} width={width} compact={compact}
            label={`Calendar of monthly ${unitWord} for ${region.name}, ${months[0].year} to ${months[months.length - 1].year}. Arrow keys move between months; the line below reads each one out.`} />
        )}
      </div>

      {!url.table && (
        <>
          <Readout hint={compact ? "Tap a month to read it out." : "Point at a month, or focus the calendar and use the arrow keys, to read it out here."}>
            {activeMonth ? describe(activeMonth, { mode, unit: px ? "px" : "fd", boxed: sel.boxed, normal: normals[activeMonth.month - 1], latest: activeMonth.ym === last.ym }) : null}
          </Readout>
          <Legend color={url.color} ramp={url.ramp} max={scaleMax} unit={unitWord} hatch={mode === "h"} />
        </>
      )}
    </section>
  );
}

function Legend({ color, ramp, max, unit, hatch }: { color: "counts" | "normal"; ramp: "cividis" | "greys"; max: number; unit: string; hatch: boolean }) {
  const stops = color === "counts"
    ? [0, 0.25, 0.5, 0.75, 1].map((t) => ({ fill: sequential(t, ramp), label: count(Math.round(max * t * t)) }))
    : [-1, -0.5, 0, 0.5, 1].map((t) => ({ fill: diverging(t), label: t === 0 ? "normal" : `${t < 0 ? `1/${2 ** (-2 * t)}` : 2 ** (2 * t)}×` }));
  return (
    <div className="calendar-legend small">
      <span>{color === "counts" ? `Monthly ${unit}` : "Against the median for that calendar month"}</span>
      <ol>
        {stops.map((s) => (
          <li key={s.label}><span className="calendar-swatch" style={{ background: s.fill }} />{s.label}</li>
        ))}
      </ol>
      {hatch && <span><span className="calendar-swatch calendar-swatch-hatch" />translated from an older satellite</span>}
      <span><span className="calendar-swatch calendar-swatch-now" />month in progress</span>
      <span><span className="calendar-swatch calendar-swatch-bar" />bars at right: year total (outlined if the year is incomplete)</span>
    </div>
  );
}
