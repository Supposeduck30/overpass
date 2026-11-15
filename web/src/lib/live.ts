import { cellIndex, localSolarDate, type Box } from "./grid";

/** Counting rules for near-real-time VIIRS rows, shared by the live function and its tests. Mirrors pipeline/clean.py. */

export const GRID_DEG = 0.25;
export const MASK_DEG = 0.01;
const KEEP_CONFIDENCE = new Set(["n", "h", "nominal", "high"]);

export interface NrtRow {
  lat: number;
  lon: number;
  acqDate: string;
  acqTime: string;
  confidence: string;
}

export function parseNrtCsv(csv: string): NrtRow[] {
  const [head, ...lines] = csv.trim().split(/\r?\n/);
  const cols = head.split(",");
  const at = (name: string) => cols.indexOf(name);
  const [lat, lon, date, time, conf] = [at("latitude"), at("longitude"), at("acq_date"), at("acq_time"), at("confidence")];
  if (lat < 0 || lon < 0 || date < 0 || time < 0 || conf < 0) return [];
  return lines.map((l) => l.split(",")).filter((c) => c.length === cols.length)
    .map((c) => ({ lat: Number(c[lat]), lon: Number(c[lon]), acqDate: c[date], acqTime: c[time], confidence: c[conf] }));
}

export function maskKey(lat: number, lon: number): number {
  const { ix, iy } = cellIndex(lat, lon, MASK_DEG);
  return iy * 100_000 + ix;
}

/** Fire-days in one local-solar month: distinct (0.25° cell, local date) pairs among qualifying rows. */
export function fireDaysInMonth(rows: NrtRow[], bbox: Box, ym: string, staticKeys: ReadonlySet<number>): number {
  const [w, s, e, n] = bbox;
  const seen = new Set<string>();
  for (const r of rows) {
    if (!(r.lat >= s && r.lat < n && r.lon >= w && r.lon < e)) continue;
    if (!KEEP_CONFIDENCE.has(r.confidence.toLowerCase())) continue;
    if (staticKeys.has(maskKey(r.lat, r.lon))) continue;
    const day = localSolarDate(r.acqDate, r.acqTime, r.lon);
    if (!day.startsWith(ym)) continue;
    const { ix, iy } = cellIndex(r.lat, r.lon, GRID_DEG);
    seen.add(`${ix},${iy},${day}`);
  }
  return seen.size;
}
