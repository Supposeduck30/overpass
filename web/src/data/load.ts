import { useEffect, useState } from "react";
import type { AtlasEntry, Cells, Clock, Current, Forecast, Hotspot, Meta, Monthly, Mtd, Region, Season, Validation } from "../types";
import { asAtlas, asCells, asClock, asCurrent, asForecast, asMeta, asMonthly, asMtd, asRegions, asSeason, asValidation } from "./guards";

const cache = new Map<string, Promise<unknown>>();

async function fetchJson(path: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(path);
  } catch {
    throw new Error(`Could not reach ${path}. Check the connection and reload.`);
  }
  if (!res.ok) throw new Error(`${path} could not be loaded (HTTP ${res.status}). Reload, or pick another region.`);
  try {
    return await res.json();
  } catch {
    throw new Error(`${path} is not valid JSON. The data folder may be mid-update; reload in a minute.`);
  }
}

function load<T>(path: string, guard: (v: unknown) => T): Promise<T> {
  let p = cache.get(path);
  if (!p) {
    p = fetchJson(path).then(guard);
    cache.set(path, p);
    p.catch(() => cache.delete(path));
  }
  return p as Promise<T>;
}

export const loadRegions = () => load<Region[]>("/data/regions.json", asRegions);
export const loadAtlas = () => load<AtlasEntry[]>("/data/atlas.json", asAtlas);
export const loadMeta = () => load<Meta>("/data/meta.json", asMeta);
export const loadMonthly = (r: string) => load<Monthly>(`/data/${r}/monthly.json`, asMonthly);
export const loadCells = (r: string) => load<Cells>(`/data/${r}/cells.json`, asCells);
export const loadMtd = (r: string) => load<Mtd>(`/data/${r}/mtd.json`, asMtd);
export const loadSeason = (r: string) => load<Season>(`/data/${r}/season.json`, asSeason);
export const loadClock = (r: string) => load<Clock>(`/data/${r}/clock.json`, asClock);
export const loadForecast = (r: string) => load<Forecast>(`/data/${r}/forecast.json`, asForecast);
export const loadValidation = (r: string) => load<Validation>(`/data/${r}/validation.json`, asValidation);

/** Live month-to-date from the serverless function; falls back to the committed file, which says it is cached. */
export async function loadCurrent(r: string): Promise<Current> {
  try {
    const res = await fetch(`/api/firms?region=${encodeURIComponent(r)}`);
    if (res.ok && res.headers.get("content-type")?.includes("json")) return asCurrent(await res.json());
  } catch {
    // fall through to the committed file
  }
  return load<Current>(`/data/current/${r}.json`, asCurrent);
}

/** One year of qualifying detections, decompressed in the browser. */
export async function loadHotspots(r: string, year: number): Promise<Hotspot[]> {
  const res = await fetch(`/data/${r}/hotspots/${year}.csv.gz`);
  if (res.status === 404) return [];
  if (!res.ok || !res.body) throw new Error(`Hotspots for ${year} could not be loaded (HTTP ${res.status}).`);
  // Some hosts send .gz with Content-Encoding and the browser has already inflated it.
  const head = new Uint8Array(await res.clone().arrayBuffer()).subarray(0, 2);
  const zipped = head[0] === 0x1f && head[1] === 0x8b;
  const text = zipped ? await new Response(res.body.pipeThrough(new DecompressionStream("gzip"))).text() : await res.text();
  return parseHotspots(text);
}

export function parseHotspots(text: string): Hotspot[] {
  const lines = text.split("\n");
  const out: Hotspot[] = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(",");
    if (c.length < 9) continue;
    out.push({ date_local: c[0], time_utc: c[1], lat: +c[2], lon: +c[3], satellite: c[4], confidence: c[5], frp: +c[6], daynight: c[7], processing: c[8] });
  }
  return out;
}

export type Loaded<T> = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; data: T };

/** Runs a loader whenever its key changes. */
export function useLoad<T>(key: string, loader: () => Promise<T>): Loaded<T> {
  const [result, setResult] = useState<{ key: string; value: Loaded<T> }>({ key, value: { state: "loading" } });
  useEffect(() => {
    let live = true;
    loader().then(
      (data) => live && setResult({ key, value: { state: "ready", data } }),
      (err: unknown) => live && setResult({ key, value: { state: "error", message: err instanceof Error ? err.message : String(err) } }),
    );
    return () => {
      live = false;
    };
    // The key stands for the loader's inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return result.key === key ? result.value : { state: "loading" };
}
