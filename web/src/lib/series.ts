import type { Box, Cells, Month, Monthly } from "../types";
import { sourceSat, ymParts } from "./format";

export type Unit = "fd" | "px";

/** What one calendar cell shows in each mode. */
export interface CellValue {
  ym: string;
  year: number;
  month: number;
  /** count from the satellite of that era, untranslated */
  raw: number | null;
  harmonized: number;
  lo: number;
  hi: number;
  partial: boolean;
  translated: boolean;
  data: Month;
}

export function cellValues(monthly: Monthly, unit: Unit): CellValue[] {
  return monthly.months.map((m) => {
    const sat = sourceSat(m.source);
    return {
      ym: m.ym, ...ymParts(m.ym),
      raw: unit === "px" ? m.pixels[sat] : m.raw[sat],
      harmonized: m.harmonized, lo: m.lo, hi: m.hi,
      partial: m.partial, translated: m.source !== "snpp", data: m,
    };
  });
}

/** Monthly record for a drawn box, summed from the per-cell allocation. Raw counts do not exist at cell level. */
export function boxSeries(monthly: Monthly, cells: Cells, box: Box): { months: CellValue[]; cellCount: number } {
  const [w, s, e, n] = box;
  const inside = cells.cells.map(([lat, lon]) => lon >= w && lon <= e && lat >= s && lat <= n);
  const sums = new Float64Array(cells.months.length);
  for (const [mi, ci, v] of cells.values) if (inside[ci]) sums[mi] += v;
  const index = new Map(cells.months.map((ym, i) => [ym, i]));
  const months = monthly.months.map((m) => {
    const value = sums[index.get(m.ym) ?? -1] ?? 0;
    // The region's relative interval is carried over; the allocation itself adds uncertainty that is not counted.
    const scale = m.harmonized > 0 ? value / m.harmonized : 0;
    return {
      ym: m.ym, ...ymParts(m.ym), raw: null, harmonized: value, lo: m.lo * scale, hi: m.hi * scale,
      partial: m.partial, translated: m.source !== "snpp", data: m,
    };
  });
  return { months, cellCount: inside.filter(Boolean).length };
}

export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Calendar-month medians over full months, index 0 = January. */
export function normalsOf(months: CellValue[]): (number | null)[] {
  return Array.from({ length: 12 }, (_, i) => {
    const v = months.filter((m) => m.month === i + 1 && !m.partial).map((m) => m.harmonized);
    return v.length ? median(v) : null;
  });
}

export interface YearTotal {
  year: number;
  harmonized: number;
  raw: number | null;
  complete: boolean;
}

export function yearTotals(months: CellValue[]): YearTotal[] {
  const by = new Map<number, CellValue[]>();
  for (const m of months) by.set(m.year, [...(by.get(m.year) ?? []), m]);
  return [...by.entries()].map(([year, ms]) => ({
    year,
    harmonized: ms.reduce((a, m) => a + m.harmonized, 0),
    raw: ms.some((m) => m.raw == null) ? null : ms.reduce((a, m) => a + (m.raw ?? 0), 0),
    complete: ms.length === 12 && ms.every((m) => !m.partial),
  }));
}
