/** Mirrors the data contract in OVERPASS_CONTEXT.md §9 (files under public/data/). */

export type Sat = "aqua" | "terra" | "snpp" | "noaa20" | "noaa21";
export type Source = "terra-translated" | "aqua-translated" | "snpp" | "noaa20-translated";
export type Box = [west: number, south: number, east: number, north: number];

export interface Region {
  id: string;
  name: string;
  bbox: Box;
  tier: "hero" | "atlas";
  fireYearStartMonth: number;
  criticalMonths: number[];
  hotspots: boolean;
}

export interface AtlasEntry {
  id: string;
  model: string;
  exchangeRate: number;
  lo: number;
  hi: number;
  atSourceCount: number;
  medApeOurs: number;
  medApeGlobalFactor: number;
  coverage90: number;
  link2Factor: number;
  link2Lo: number;
  link2Hi: number;
  link2Model: string;
}

export interface Link {
  model: string;
  params: Record<string, number | string | number[]>;
  fit: string;
  factor: { value: number; lo: number; hi: number };
  exchange: { atSourceCount: number; rate: number; lo: number; hi: number };
  coverage90: number;
}

export interface Month {
  ym: string;
  harmonized: number;
  lo: number;
  hi: number;
  source: Source;
  partial: boolean;
  raw: Record<Sat, number | null>;
  pixels: Record<Sat, number | null>;
  median: number | null;
  percentile: number | null;
}

export interface Monthly {
  region: string;
  unit: string;
  unitColumn: string;
  links: { terra_snpp: Link; aqua_snpp: Link; noaa20_snpp: Link };
  normals: (number | null)[];
  months: Month[];
}

export interface Cells {
  grid: number;
  cells: [lat: number, lon: number][];
  months: string[];
  values: [monthIndex: number, cellIndex: number, value: number][];
}

export interface Mtd {
  byMonth: Record<string, Record<string, number[]>>;
}

export interface Season {
  fireYearStartMonth: number;
  years: Record<string, number[]>;
  envelope: Record<"p10" | "p25" | "p50" | "p75" | "p90", number[]>;
  completeYears: number;
}

export interface Trend {
  daysPerDecade: number;
  lo: number;
  hi: number;
  p: number;
  comparable?: boolean;
}

export type Mark = "onset" | "peak" | "end";

export interface ClockYear {
  fireYear: number;
  onset: number;
  peak: number;
  end: number;
  total: number | null;
  sat: Sat;
}

export interface Clock {
  fireYearStartMonth: number;
  years: ClockYear[];
  trend: Record<Mark | "length", Trend | null>;
  trendAquaOnly: Record<Mark | "length", Trend | null>;
  overlapCheck: { years: number[]; meanAbsDiffDays: number | null; onsetDays?: number; peakDays?: number; endDays?: number };
}

export interface LadderRow {
  model: string;
  medApe: number | null;
  mae: number | null;
  r2log: number | null;
  bias: number | null;
  n: number;
  chosen: boolean;
}

export interface SplitPoint {
  ym: string;
  pred: number;
  lo: number;
  hi: number;
  actual: number;
  source: number;
}

export interface SplitTest {
  train: string;
  test: string;
  points: SplitPoint[];
  medApe: number | null;
  mae: number | null;
  r2log: number | null;
  bias: number | null;
  n: number;
  coverage90: number;
}

export interface Step {
  step: number;
  lo: number;
  hi: number;
}

export interface ChangePoint {
  ym: string;
  p: number;
}

export interface SeamPair {
  raw: Step;
  harmonized: Step;
}

export interface Pettitt {
  raw: ChangePoint;
  harmonized: ChangePoint;
  aquaOnly: ChangePoint;
}

/** Keyed by the first month after each handoff, plus "pettitt". */
export type Seams = Record<string, SeamPair | Pettitt>;

export interface UnitRow {
  unit: string;
  column: string;
  cv: number | null;
  sdLog: number | null;
  months: number;
  saturation: number | null;
  chosen: boolean;
  steadiest?: boolean;
}

export type DriftSat = "aqua" | "terra" | "snpp" | "noaa20";

export type DriftRow = { year: number; ratio: number | null } & {
  [K in `${DriftSat}Lst`]: number | null;
} & { [K in `${DriftSat}LstIqr`]: [number, number] | null };

export interface DriftEffect {
  detected: boolean | null;
  baselineRatio?: number;
  baselineSd?: number;
  lateRatio?: number;
  lateYearsOutside?: number;
  lateYears?: number;
  aquaShiftMinutes?: number;
  aquaLatestShiftMinutes?: number;
}

export interface Validation {
  region: string;
  unit: string;
  ladder: LadderRow[];
  ladderLink2: LadderRow[];
  forward: SplitTest;
  backward: SplitTest;
  coverage90: number;
  coverage90Raw: number;
  intervalScale: number;
  coverage90Link2: number;
  coverage90Link2Raw: number;
  seams: Seams;
  units: UnitRow[];
  drift: DriftRow[];
  driftEffect: DriftEffect;
  handoff: {
    factor: number;
    lo: number;
    hi: number;
    model: string;
    fit: string;
    points: { ym: string; noaa20: number; snpp: number }[];
    noaa21?: { months: string; ratioToNoaa20: number };
  };
  exchange: { atSourceCount: number; rate: number; lo: number; hi: number };
  /** Terra and Aqua each translated on their own for the years before S-NPP. */
  terraCheck: { months: string; totalRatio: number; years: { year: number; terra: number; aqua: number }[] };
  topYears: { year: number; total: number }[];
  pooledRegions: string[];
  notes: string[];
}

export interface Forecast {
  shown: boolean;
  horizonMonths: number;
  skill: {
    backtest: string;
    months: number;
    model: number;
    climatology: number;
    persistence: number;
    coverage90Raw: number;
    intervalScale: number;
    coverage90: number;
  };
  next: { ym: string; from: string; value: number; lo: number; hi: number; normal: number } | null;
}

export interface Current {
  asOf: string;
  ym: string;
  day: number;
  fireDaysToDate: number;
  harmonizedToDate: number;
  source: string;
  cached: boolean;
}

export interface Meta {
  builtAt: string;
  commit: string;
  availability: { data_id: string; min_date: string; max_date: string }[];
  lastDate: Record<string, Record<string, string>>;
  hotspotsDropped: string[];
  sizeMb: number;
}

export interface Hotspot {
  date_local: string;
  time_utc: string;
  lat: number;
  lon: number;
  satellite: string;
  confidence: string;
  frp: number;
  daynight: string;
  processing: string;
}
