import { count, monthLabel, MONTHS_LONG, SAT_NAMES, sourcePhrase, sourceSat } from "../lib/format";
import { median, type CellValue, type Unit } from "../lib/series";

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
  return Array.from({ length: 12 }, (_, i) => {
    const v = months.filter((m) => m.month === i + 1 && !m.partial).map((m) => valueAt(m, k));
    return v.length ? median(v) : null;
  });
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
