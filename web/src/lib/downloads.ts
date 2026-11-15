import { loadHotspots } from "../data/load";
import type { Box, Sat } from "../types";
import { saveFile, toCsv } from "./format";
import { inBox } from "./grid";
import type { CellValue } from "./series";

const SATS: Sat[] = ["aqua", "terra", "snpp", "noaa20", "noaa21"];

export function boxSlug(box: Box | null): string {
  return box ? `_box_${box.join("_")}` : "";
}

/** Harmonized monthly record. A drawn box has no raw counts of its own, so those columns stay empty. */
export function monthlyCsv(months: CellValue[], boxed: boolean): string {
  const header = ["month", "harmonized_fire_days", "interval_low", "interval_high", "source", "partial_month", ...SATS.map((s) => `raw_fire_days_${s}`)];
  return toCsv(header, months.map((m) => [
    m.ym, m.harmonized.toFixed(2), m.lo.toFixed(2), m.hi.toFixed(2), m.data.source, m.partial,
    ...SATS.map((s) => (boxed ? null : m.data.raw[s])),
  ]));
}

const HOTSPOT_COLS = ["date_local", "time_utc", "lat", "lon", "satellite", "confidence", "frp", "daynight", "processing"] as const;

/** Qualifying detections for the selection, one year file at a time. Returns the CSV and the row count. */
export async function hotspotsCsv(region: string, fromYm: string, toYm: string, box: Box | null,
  onProgress: (year: number) => void): Promise<{ csv: string; rows: number }> {
  const rows: (string | number)[][] = [];
  for (let year = Number(fromYm.slice(0, 4)); year <= Number(toYm.slice(0, 4)); year++) {
    onProgress(year);
    for (const h of await loadHotspots(region, year)) {
      const ym = h.date_local.slice(0, 7);
      if (ym < fromYm || ym > toYm || (box && !inBox(h.lat, h.lon, box))) continue;
      rows.push(HOTSPOT_COLS.map((c) => h[c]));
    }
  }
  return { csv: toCsv([...HOTSPOT_COLS], rows), rows: rows.length };
}

/** Rasterize an on-page SVG at 2x and save it. */
export async function saveSvgAsPng(svg: SVGSVGElement, name: string): Promise<void> {
  const { width, height } = svg.getBoundingClientRect();
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(copy))}`;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = width * 2;
  canvas.height = height * 2;
  canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("The browser could not encode the image.");
  saveFile(name, blob);
}
