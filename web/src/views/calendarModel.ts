import { seamSteps } from "../data/guards";
import { count, monthLabel, MONTHS_LONG, SAT_NAMES, sourcePhrase, sourceSat, times } from "../lib/format";
import { median, yearTotals, type CellValue, type Unit } from "../lib/series";
import type { Validation } from "../types";

export interface Handoff {
  ym: string;
  year: number;
  label: string;
  /** which edge of the year's row the rule sits on */
  place: "above" | "below";
}

/** Months where the record's source satellite changes, read from the data. */
export function handoffs(months: CellValue[]): Handoff[] {
  const out: Handoff[] = [];
  for (let i = 1; i < months.length; i++) {
    const sat = sourceSat(months[i].data.source);
    if (sat === sourceSat(months[i - 1].data.source)) continue;
    const verb = sat === "snpp" ? "S-NPP VIIRS begins" : `${SAT_NAMES[sat]} takes over`;
    out.push({ ym: months[i].ym, year: months[i].year, label: `${verb}, ${monthLabel(months[i].ym)}`, place: months[i].month <= 6 ? "above" : "below" });
  }
  return out;
}

/** The value a cell shows part-way through the harmonize transition: k = 0 raw, k = 1 harmonized. */
export function valueAt(m: CellValue, k: number): number {
  return m.raw == null ? m.harmonized : m.raw + (m.harmonized - m.raw) * k;
}

/** Calendar-month medians of whatever is on screen at k, index 0 = January. */
export function normalsAt(months: CellValue[], k: number): (number | null)[] {
  const buckets = Array.from({ length: 12 }, () => [] as number[]);
  for (const m of months) {
    if (!m.partial) buckets[m.month - 1].push(valueAt(m, k));
  }
  return buckets.map((v) => v.length ? median(v) : null);
}

/** Relative width of a translated month's interval, used for hatch density. 0 for measured months. */
export function relativeWidth(m: CellValue): number {
  return m.translated && m.harmonized > 0 ? (m.hi - m.lo) / m.harmonized : 0;
}

interface Describe {
  mode: "h" | "r";
  unit: Unit;
  boxed: boolean;
  normal: number | null;
  latest: boolean;
}

/** The readout line for one month. */
export function describe(m: CellValue, { mode, unit, boxed, normal, latest }: Describe): string {
  const sat = SAT_NAMES[sourceSat(m.data.source)];
  const when = monthLabel(m.ym);
  const range = m.translated ? ` (${count(m.lo)}–${count(m.hi)})` : "";
  const partial = m.partial ? (latest ? " The month is still in progress." : " The record starts part-way through this month.") : "";
  const usual = normal == null ? "" : ` Normal for ${MONTHS_LONG[m.month - 1]}: ${count(normal)}.`;

  if (unit === "px") return `${when}: ${sat} recorded ${count(m.raw)} detections.${partial}`;
  if (boxed) return `${when}: ${count(m.harmonized)} fire-days${range} in your box, allocated from the region's total.${usual}${partial}`;
  if (mode === "r") {
    const also = m.translated ? ` Harmonized: ${count(m.harmonized)}${range}.` : " No translation needed.";
    return `${when}: ${sat} counted ${count(m.raw)} fire-days.${also}${partial}`;
  }
  const source = m.translated ? `, ${sourcePhrase(m.data.source)}. ${sat} counted ${count(m.raw)}.` : `, ${sourcePhrase(m.data.source)}.`;
  return `${when}: ${count(m.harmonized)} fire-days${range}${source}${usual}${partial}`;
}

/** The finding sentence for the monthly record, shared by the calendar and the terrain. */
export function recordFinding(months: CellValue[], mode: "h" | "r", px: boolean, boxed: boolean, validation: Validation): string {
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
