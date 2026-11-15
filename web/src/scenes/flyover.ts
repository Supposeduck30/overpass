import { monthLabel } from "../lib/format";
import type { Cells } from "../types";

export interface Column {
  /** index into cells.cells */
  ci: number;
  lat: number;
  lon: number;
  value: number;
}

export interface Flyover {
  /** burning cells for each month, by month index */
  byMonth: Column[][];
  /** harmonized fire-days summed over cells, by month index */
  totals: number[];
  /** the largest single cell-month, so heights compare across months */
  max: number;
  /** month index with the most burning */
  busiest: number;
}

export function buildFlyover(cells: Cells): Flyover {
  const byMonth: Column[][] = cells.months.map(() => []);
  let max = 0;
  for (const [mi, ci, value] of cells.values) {
    if (value <= 0) continue;
    const [lat, lon] = cells.cells[ci];
    byMonth[mi].push({ ci, lat, lon, value });
    if (value > max) max = value;
  }
  const totals = byMonth.map((cols) => cols.reduce((a, c) => a + c.value, 0));
  return { byMonth, totals, max: max || 1, busiest: totals.indexOf(Math.max(...totals)) };
}

export function place(lat: number, lon: number): string {
  return `${Math.abs(lat)}°${lat < 0 ? "S" : "N"}, ${Math.abs(lon)}°${lon < 0 ? "W" : "E"}`;
}

/** One cell's value in every month of the record, zero where it did not burn. */
export function cellSeries(cells: Cells, ci: number): number[] {
  const out = new Array<number>(cells.months.length).fill(0);
  for (const [mi, c, value] of cells.values) if (c === ci) out[mi] = value;
  return out;
}

/** The readout line for one column. */
export function describeColumn(c: Column, ym: string): string {
  return `${monthLabel(ym)}, cell at ${place(c.lat, c.lon)}: ${c.value.toFixed(1)} fire-days, its share of the region's harmonized total.`;
}
