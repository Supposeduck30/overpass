/** Gridding shared with the pipeline (pipeline/lib/gridding.py, pipeline/lib/solar.py). */

export interface CellIndex {
  ix: number;
  iy: number;
}

/** ix counts cells east from 180°W, iy north from 90°S. Same arithmetic as the pipeline, so edges fall the same way. */
export function cellIndex(lat: number, lon: number, g: number): CellIndex {
  return { ix: Math.floor((lon + 180) / g), iy: Math.floor((lat + 90) / g) };
}

export function cellCenter(ix: number, iy: number, g: number): { lat: number; lon: number } {
  return { lat: (iy + 0.5) * g - 90, lon: (ix + 0.5) * g - 180 };
}

/** Local solar date (YYYY-MM-DD): UTC time plus longitude/15 hours. acqTime is FIRMS "HHMM", possibly unpadded. */
export function localSolarDate(acqDate: string, acqTime: string | number, lon: number): string {
  const hhmm = String(acqTime).padStart(4, "0");
  const utc = Date.parse(`${acqDate}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00Z`);
  return new Date(utc + (lon / 15) * 3_600_000).toISOString().slice(0, 10);
}

export type Box = [west: number, south: number, east: number, north: number];

export function inBox(lat: number, lon: number, [w, s, e, n]: Box): boolean {
  return lon >= w && lon <= e && lat >= s && lat <= n;
}

export function boxInside(inner: Box, outer: Box): boolean {
  return inner[0] >= outer[0] && inner[1] >= outer[1] && inner[2] <= outer[2] && inner[3] <= outer[3];
}
