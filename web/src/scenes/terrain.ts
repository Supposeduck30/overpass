import type { CellValue } from "../lib/series";

/** Vertices per month and per year along each edge of a cell. */
export const SUB = 8;
/** World size of one month across, one year deep, and the tallest month. */
export const CELL_X = 1;
export const CELL_Z = 0.6;
export const HEIGHT = 3.4;

/** The record laid out as years by months, row 0 the oldest year. Months outside the record are zero with no ym. */
export interface Grid {
  years: number[];
  raw: Float32Array;
  harm: Float32Array;
  lo: Float32Array;
  hi: Float32Array;
  /** 1 where the month was translated from an older satellite */
  mask: Float32Array;
  ym: (string | null)[];
  max: number;
}

export function buildGrid(months: CellValue[]): Grid {
  const first = months[0].year;
  const n = months[months.length - 1].year - first + 1;
  const years = Array.from({ length: n }, (_, i) => first + i);
  const make = () => new Float32Array(n * 12);
  const g: Grid = { years, raw: make(), harm: make(), lo: make(), hi: make(), mask: make(), ym: new Array<string | null>(n * 12).fill(null), max: 1 };
  for (const m of months) {
    const i = (m.year - first) * 12 + m.month - 1;
    g.raw[i] = m.raw ?? m.harmonized;
    g.harm[i] = m.harmonized;
    g.lo[i] = m.lo;
    g.hi[i] = m.hi;
    g.mask[i] = m.translated ? 1 : 0;
    g.ym[i] = m.ym;
    g.max = Math.max(g.max, g.raw[i], g.harm[i]);
  }
  return g;
}

const ease = (t: number) => t * t * (3 - 2 * t);

/** A field read at grid position (x months, z years), eased between month centres so each month keeps its own value at its centre. */
export function sample(field: Float32Array, rows: number, x: number, z: number): number {
  const u = Math.min(11, Math.max(0, x - 0.5));
  const w = Math.min(rows - 1, Math.max(0, z - 0.5));
  const i = Math.min(10, Math.floor(u));
  const j = Math.max(0, Math.min(rows - 2, Math.floor(w)));
  const j1 = Math.min(rows - 1, j + 1);
  const fx = ease(u - i);
  const fz = ease(Math.min(1, w - j));
  const a = field[j * 12 + i] + (field[j * 12 + i + 1] - field[j * 12 + i]) * fx;
  const b = field[j1 * 12 + i] + (field[j1 * 12 + i + 1] - field[j1 * 12 + i]) * fx;
  return a + (b - a) * fz;
}

/** Fire-days at a grid position part-way through the harmonize transition: k = 0 raw, k = 1 harmonized. */
export function valueAt(g: Grid, x: number, z: number, k: number): number {
  const raw = sample(g.raw, g.years.length, x, z);
  return raw + (sample(g.harm, g.years.length, x, z) - raw) * k;
}

export const worldX = (x: number) => (x - 6) * CELL_X;
export const worldZ = (g: Grid, z: number) => (z - g.years.length / 2) * CELL_Z;
export const worldY = (g: Grid, v: number) => (v / g.max) * HEIGHT;

export interface Surface {
  position: Float32Array;
  grid: Float32Array;
  raw: Float32Array;
  harm: Float32Array;
  lo: Float32Array;
  hi: Float32Array;
  mask: Float32Array;
  normalRaw: Float32Array;
  normalHarm: Float32Array;
  index: Uint32Array;
}

function normals(field: Float32Array, g: Grid, nx: number, nz: number): Float32Array {
  const rows = g.years.length;
  const out = new Float32Array(nx * nz * 3);
  const d = 0.5 / SUB;
  const lift = HEIGHT / g.max;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = i / SUB;
      const z = j / SUB;
      const dx = ((sample(field, rows, x + d, z) - sample(field, rows, x - d, z)) * lift) / (2 * d * CELL_X);
      const dz = ((sample(field, rows, x, z + d) - sample(field, rows, x, z - d)) * lift) / (2 * d * CELL_Z);
      const len = Math.hypot(dx, 1, dz);
      out.set([-dx / len, 1 / len, -dz / len], (j * nx + i) * 3);
    }
  }
  return out;
}

/** The terrain mesh: a flat lattice with both heights, the interval and smooth normals at every vertex. */
export function buildSurface(g: Grid): Surface {
  const rows = g.years.length;
  const nx = 12 * SUB + 1;
  const nz = rows * SUB + 1;
  const count = nx * nz;
  const s: Surface = {
    position: new Float32Array(count * 3), grid: new Float32Array(count * 2),
    raw: new Float32Array(count), harm: new Float32Array(count), lo: new Float32Array(count), hi: new Float32Array(count), mask: new Float32Array(count),
    normalRaw: normals(g.raw, g, nx, nz), normalHarm: normals(g.harm, g, nx, nz),
    index: new Uint32Array((nx - 1) * (nz - 1) * 6),
  };
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const v = j * nx + i;
      const x = i / SUB;
      const z = j / SUB;
      s.position.set([worldX(x), 0, worldZ(g, z)], v * 3);
      s.grid.set([x, z], v * 2);
      s.raw[v] = sample(g.raw, rows, x, z);
      s.harm[v] = sample(g.harm, rows, x, z);
      s.lo[v] = sample(g.lo, rows, x, z);
      s.hi[v] = sample(g.hi, rows, x, z);
      s.mask[v] = sample(g.mask, rows, x, z);
    }
  }
  let t = 0;
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      s.index.set([a, a + nx, a + 1, a + 1, a + nx, a + nx + 1], t);
      t += 6;
    }
  }
  return s;
}

/** World positions along a path of grid points, resting on the surface at k. */
export function drape(g: Grid, path: [x: number, z: number][], k: number, above = 0.02): number[] {
  const out: number[] = [];
  for (let p = 0; p < path.length - 1; p++) {
    const [x0, z0] = path[p];
    const [x1, z1] = path[p + 1];
    const steps = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) * SUB));
    for (let i = p ? 1 : 0; i <= steps; i++) {
      const x = x0 + ((x1 - x0) * i) / steps;
      const z = z0 + ((z1 - z0) * i) / steps;
      out.push(worldX(x), worldY(g, valueAt(g, x, z, k)) + above, worldZ(g, z));
    }
  }
  return out;
}

/** The boundary the record crosses at a handoff month: behind that month's row from the month on, in front of it before. */
export function handoffPath(g: Grid, ym: string): [number, number][] {
  const row = Number(ym.slice(0, 4)) - g.years[0];
  const col = Number(ym.slice(5)) - 1;
  if (col === 0) return [[0, row], [12, row]];
  return [[0, row + 1], [col, row + 1], [col, row], [12, row]];
}

/** The month under a ray, found by walking the ray until it drops below the surface at k. Origin and direction are in world units. */
export function pick(g: Grid, origin: [number, number, number], dir: [number, number, number], k: number, reach: number): string | null {
  const rows = g.years.length;
  const steps = 480;
  for (let i = 1; i <= steps; i++) {
    const t = (reach * i) / steps;
    const x = (origin[0] + dir[0] * t) / CELL_X + 6;
    const z = (origin[2] + dir[2] * t) / CELL_Z + rows / 2;
    if (x < 0 || x >= 12 || z < 0 || z >= rows) continue;
    if (origin[1] + dir[1] * t <= worldY(g, valueAt(g, x, z, k))) return g.ym[Math.floor(z) * 12 + Math.floor(x)];
  }
  return null;
}

/** A round contour interval that gives about six lines up the tallest month. */
export function contourStep(max: number): number {
  const rough = max / 6;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const unit = rough / pow;
  return (unit < 1.5 ? 1 : unit < 3.5 ? 2 : unit < 7.5 ? 5 : 10) * pow;
}
