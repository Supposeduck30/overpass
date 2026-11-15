import type {
  AtlasEntry,
  Cells,
  Clock,
  Current,
  Forecast,
  Meta,
  Monthly,
  Mtd,
  Pettitt,
  Region,
  SeamPair,
  Season,
  Validation,
} from "../types";

/** Thrown when a data file does not have the shape the app was built for. */
export class MalformedFile extends Error {
  constructor(file: string, problem: string) {
    super(`${file} is not in the expected format: ${problem}.`);
  }
}

type Kind = "string" | "number" | "boolean" | "array" | "object";
type Shape = Record<string, Kind>;

function kindOf(v: unknown): Kind | "null" | "undefined" {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v as Kind | "undefined";
}

function check(file: string, value: unknown, shape: Shape, where = "the file"): void {
  if (kindOf(value) !== "object") throw new MalformedFile(file, `${where} should be an object`);
  const obj = value as Record<string, unknown>;
  for (const [key, kind] of Object.entries(shape)) {
    if (kindOf(obj[key]) !== kind) {
      throw new MalformedFile(file, `"${key}" in ${where} should be ${kind}, found ${kindOf(obj[key])}`);
    }
  }
}

function checkList(file: string, value: unknown, shape: Shape, where: string, needOne = true): void {
  if (!Array.isArray(value)) throw new MalformedFile(file, `${where} should be a list`);
  if (needOne && value.length === 0) throw new MalformedFile(file, `${where} is empty`);
  value.forEach((item, i) => check(file, item, shape, `${where}[${i}]`));
}

export function asRegions(v: unknown): Region[] {
  checkList("regions.json", v, { id: "string", name: "string", bbox: "array", tier: "string", fireYearStartMonth: "number", criticalMonths: "array", hotspots: "boolean" }, "regions");
  return v as Region[];
}

export function asAtlas(v: unknown): AtlasEntry[] {
  checkList("atlas.json", v, { id: "string", model: "string", exchangeRate: "number", lo: "number", hi: "number", medApeOurs: "number", medApeGlobalFactor: "number", link2Factor: "number" }, "atlas");
  return v as AtlasEntry[];
}

export function asMonthly(v: unknown): Monthly {
  const f = "monthly.json";
  check(f, v, { region: "string", unit: "string", links: "object", normals: "array", months: "array" });
  const m = v as Monthly;
  for (const key of ["terra_snpp", "aqua_snpp", "noaa20_snpp"] as const) {
    check(f, m.links[key], { model: "string", params: "object", fit: "string", factor: "object", exchange: "object" }, `links.${key}`);
  }
  checkList(f, m.months, { ym: "string", harmonized: "number", lo: "number", hi: "number", source: "string", partial: "boolean", raw: "object", pixels: "object" }, "months");
  return m;
}

export function asCells(v: unknown): Cells {
  check("cells.json", v, { grid: "number", cells: "array", months: "array", values: "array" });
  return v as Cells;
}

export function asMtd(v: unknown): Mtd {
  check("mtd.json", v, { byMonth: "object" });
  return v as Mtd;
}

export function asSeason(v: unknown): Season {
  check("season.json", v, { fireYearStartMonth: "number", years: "object", envelope: "object" });
  check("season.json", (v as Season).envelope, { p10: "array", p25: "array", p50: "array", p75: "array", p90: "array" }, "envelope");
  return v as Season;
}

export function asClock(v: unknown): Clock {
  check("clock.json", v, { fireYearStartMonth: "number", years: "array", trend: "object", trendAquaOnly: "object", overlapCheck: "object" });
  checkList("clock.json", (v as Clock).years, { fireYear: "number", onset: "number", peak: "number", end: "number", sat: "string" }, "years");
  return v as Clock;
}

export function asValidation(v: unknown): Validation {
  const f = "validation.json";
  check(f, v, { ladder: "array", ladderLink2: "array", forward: "object", backward: "object", coverage90: "number", seams: "object", units: "array", drift: "array", driftEffect: "object", handoff: "object", terraCheck: "object", exchange: "object", topYears: "array", notes: "array" });
  const val = v as Validation;
  checkList(f, val.ladder, { model: "string", chosen: "boolean", n: "number" }, "ladder");
  for (const key of ["forward", "backward"] as const) {
    check(f, val[key], { train: "string", test: "string", points: "array", coverage90: "number" }, key);
  }
  check(f, val.seams.pettitt, { raw: "object", harmonized: "object", aquaOnly: "object" }, "seams.pettitt");
  checkList(f, val.units, { unit: "string", chosen: "boolean" }, "units");
  checkList(f, val.drift, { year: "number" }, "drift");
  check(f, val.handoff, { factor: "number", lo: "number", hi: "number", model: "string", points: "array" }, "handoff");
  return val;
}

export function asForecast(v: unknown): Forecast {
  check("forecast.json", v, { shown: "boolean", horizonMonths: "number", skill: "object" });
  return v as Forecast;
}

export function asCurrent(v: unknown): Current {
  check("current.json", v, { asOf: "string", ym: "string", day: "number", fireDaysToDate: "number", harmonizedToDate: "number", source: "string", cached: "boolean" });
  return v as Current;
}

export function asMeta(v: unknown): Meta {
  check("meta.json", v, { builtAt: "string", commit: "string", availability: "array", lastDate: "object" });
  return v as Meta;
}

export function pettittOf(v: Validation): Pettitt {
  return v.seams.pettitt as Pettitt;
}

/** The step tests, one per handoff that could be tested, oldest first. */
export function seamSteps(v: Validation): ({ ym: string } & SeamPair)[] {
  return Object.entries(v.seams)
    .filter(([key]) => key !== "pettitt")
    .map(([ym, pair]) => ({ ym, ...(pair as SeamPair) }))
    .sort((a, b) => a.ym.localeCompare(b.ym));
}
