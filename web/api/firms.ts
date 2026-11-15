import { predict, type LinkParams } from "../src/lib/link";
import { fireDaysInMonth, parseNrtCsv } from "../src/lib/live";
import type { Box } from "../src/lib/grid";

/**
 * GET /api/firms?region=cordoba      month-to-date for a prepared region, in the shape of data/current/{region}.json
 * GET /api/firms?box=w,s,e,n&days=31 recent NOAA-20 detections for any box, as CSV, uncalibrated
 *
 * The FIRMS key stays on the server. Both answers are cached for three hours.
 */

const FIRMS = "https://firms.modaps.eosdis.nasa.gov/api/area/csv";
const SOURCE = "VIIRS_NOAA20_NRT";
/** The Area API serves at most five days per request. */
const CHUNK_DAYS = 5;
/** Largest box, in square degrees, for the box mode. Matches AreaSheet.tsx. */
const MAX_AREA = 400;
const MAX_DAYS = 31;
const CACHE = "public, s-maxage=10800, stale-while-revalidate=3600";
const DAY_MS = 86_400_000;

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

async function areaCsv(key: string, box: Box, fromMs: number, toMs: number): Promise<string> {
  const starts: number[] = [];
  for (let t = fromMs; t <= toMs; t += CHUNK_DAYS * DAY_MS) starts.push(t);
  const parts = await Promise.all(starts.map(async (t) => {
    const days = Math.min(CHUNK_DAYS, Math.floor((toMs - t) / DAY_MS) + 1);
    const res = await fetch(`${FIRMS}/${key}/${SOURCE}/${box.join(",")}/${days}/${isoDay(t)}`);
    const text = await res.text();
    if (!res.ok || !text.startsWith("latitude")) throw new Error(`FIRMS answered ${res.status}`);
    return text.trim();
  }));
  const [head] = parts[0].split(/\r?\n/, 1);
  return [head, ...parts.flatMap((p) => p.split(/\r?\n/).slice(1))].join("\n");
}

function parseBox(text: string | null): Box | null {
  const n = (text ?? "").split(",").map(Number);
  if (n.length !== 4 || n.some((v) => !Number.isFinite(v))) return null;
  const [w, s, e, north] = n;
  return w < e && s < north && w >= -180 && e <= 180 && s >= -90 && north <= 90 ? [w, s, e, north] : null;
}

async function siteJson<T>(origin: string, path: string): Promise<T> {
  const res = await fetch(`${origin}${path}`);
  if (!res.ok) throw new Error(`${path} answered ${res.status}`);
  return (await res.json()) as T;
}

async function regionAnswer(origin: string, key: string, id: string): Promise<Response> {
  const committed = () => siteJson<Record<string, unknown>>(origin, `/data/current/${id}.json`);
  try {
    const [regions, monthly, mask] = await Promise.all([
      siteJson<{ id: string; bbox: Box }[]>(origin, "/data/regions.json"),
      siteJson<{ links: { noaa20_snpp: { params: LinkParams } } }>(origin, `/data/${id}/monthly.json`),
      siteJson<{ keys: number[] }>(origin, `/data/${id}/static.json`),
    ]);
    const region = regions.find((r) => r.id === id);
    if (!region) return new Response("Unknown region.", { status: 404 });

    const now = Date.now();
    const lon = (region.bbox[0] + region.bbox[2]) / 2;
    const localToday = isoDay(now + (lon / 15) * 3_600_000);
    const ym = localToday.slice(0, 7);
    // One UTC day either side of the local month covers every longitude's offset.
    const csv = await areaCsv(key, region.bbox, Date.parse(`${ym}-01T00:00:00Z`) - DAY_MS, now);
    const fireDays = fireDaysInMonth(parseNrtCsv(csv), region.bbox, ym, new Set(mask.keys));
    const harmonized = predict(monthly.links.noaa20_snpp.params, fireDays);
    if (harmonized == null) throw new Error("unknown link model");

    return Response.json({
      asOf: new Date(now).toISOString().slice(0, 19) + "Z",
      ym, day: Number(localToday.slice(8)),
      fireDaysToDate: fireDays, harmonizedToDate: Math.round(harmonized * 100) / 100,
      source: SOURCE, cached: false,
    }, { headers: { "Cache-Control": CACHE } });
  } catch {
    try {
      return Response.json({ ...(await committed()), cached: true }, { headers: { "Cache-Control": "public, s-maxage=600" } });
    } catch {
      return new Response("Neither FIRMS nor the stored figure could be read.", { status: 502 });
    }
  }
}

async function boxAnswer(key: string, box: Box, days: number): Promise<Response> {
  if ((box[2] - box[0]) * (box[3] - box[1]) > MAX_AREA) return new Response(`Boxes larger than ${MAX_AREA} square degrees are not served.`, { status: 400 });
  try {
    const now = Date.now();
    const csv = await areaCsv(key, box, now - (days - 1) * DAY_MS, now);
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": CACHE } });
  } catch (err) {
    return new Response(`FIRMS did not answer (${err instanceof Error ? err.message : "unknown error"}).`, { status: 502 });
  }
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const key = process.env.FIRMS_MAP_KEY;
  const region = url.searchParams.get("region");
  const box = parseBox(url.searchParams.get("box"));

  if (region) {
    if (!/^[a-z0-9_]+$/.test(region)) return new Response("Unknown region.", { status: 404 });
    if (!key) {
      const res = await fetch(`${url.origin}/data/current/${region}.json`);
      return res.ok ? Response.json({ ...((await res.json()) as object), cached: true }) : new Response("Unknown region.", { status: 404 });
    }
    return regionAnswer(url.origin, key, region);
  }
  if (box) {
    if (!key) return new Response("This site has no FIRMS key configured.", { status: 503 });
    const days = Math.min(MAX_DAYS, Math.max(1, Math.round(Number(url.searchParams.get("days")) || MAX_DAYS)));
    return boxAnswer(key, box, days);
  }
  return new Response("Pass region=<id> or box=west,south,east,north.", { status: 400 });
}
