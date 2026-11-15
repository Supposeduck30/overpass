import type { DriftRow, DriftSat } from "../types";
import { TOKENS } from "../lib/color";
import { SAT_NAMES } from "../lib/format";
import "./Dial.css";

export const DIAL_SATS: DriftSat[] = ["terra", "aqua", "snpp", "noaa20"];

/** Ring radius for each satellite, as a share of the dial radius, so arcs that overlap in time stay apart. */
const LANE: Record<DriftSat, number> = { terra: 0.86, aqua: 0.86, snpp: 0.7, noaa20: 0.54 };
/** Aqua is the one that drifts, so it carries the "now" color; the rest are chalk at different weights. */
const STROKE: Record<DriftSat, string> = { terra: TOKENS.lightBlue, aqua: TOKENS.sodium, snpp: TOKENS.chalk, noaa20: TOKENS.chalk };

/** Local solar hour to an angle in radians: noon at the top, clockwise. */
export function hourAngle(hour: number): number {
  return ((hour - 12) / 24) * 2 * Math.PI;
}

function point(hour: number, r: number): [number, number] {
  const a = hourAngle(hour);
  return [r * Math.sin(a), -r * Math.cos(a)];
}

function arc(from: number, to: number, r: number): string {
  const [x0, y0] = point(from, r);
  const [x1, y1] = point(to, r);
  return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${to - from > 12 ? 1 : 0} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
}

export function formatHour(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${String(m === 60 ? h + 1 : h).padStart(2, "0")}:${String(m === 60 ? 0 : m).padStart(2, "0")}`;
}

/** The 20 px wordmark glyph: a ring with one tick per satellite at its measured overpass time. */
export function dialGlyphSvg(row: DriftRow | undefined, size = 20, ink: string = TOKENS.night): string {
  const ticks = DIAL_SATS.map((sat) => {
    const h = row?.[`${sat}Lst`];
    if (h == null) return "";
    const [x0, y0] = point(h, 4.2);
    const [x1, y1] = point(h, 9);
    return `<line x1="${x0.toFixed(2)}" y1="${y0.toFixed(2)}" x2="${x1.toFixed(2)}" y2="${y1.toFixed(2)}" stroke="${ink}" stroke-width="${sat === "aqua" ? 2.4 : 1.4}" stroke-linecap="round"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="-10 -10 20 20"><circle r="8.6" fill="none" stroke="${ink}" stroke-width="1.5"/>${ticks}</svg>`;
}

interface Props {
  row: DriftRow;
  size: number;
}

/** 24-hour local-solar-time ring. Each satellite is an arc over the middle half of its daytime overpass times, with a tick at the median. */
export function Dial({ row, size }: Props) {
  const R = size / 2 - 34;
  const present = DIAL_SATS.filter((sat) => row[`${sat}Lst`] != null);
  return (
    <svg className="dial" width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} role="img"
      aria-label={`Measured daytime overpass times in ${row.year}: ${present.map((s) => `${SAT_NAMES[s]} ${formatHour(row[`${s}Lst`]!)}`).join(", ")}.`}>
      <rect x={-size / 2} y={-size / 2} width={size} height={size} fill={TOKENS.night} />
      <circle r={R} fill="none" stroke="var(--plate-rule)" strokeWidth={1} />
      {Array.from({ length: 24 }, (_, h) => {
        const major = h % 6 === 0;
        const [x0, y0] = point(h, R);
        const [x1, y1] = point(h, R + (major ? 8 : 4));
        const [tx, ty] = point(h, R + 20);
        return (
          <g key={h}>
            <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="var(--plate-rule)" />
            {major && (
              <text x={tx} y={ty} textAnchor="middle" dominantBaseline="central" className="dial-hour">
                {h === 12 ? "noon" : h === 0 ? "midnight" : `${String(h).padStart(2, "0")}:00`}
              </text>
            )}
          </g>
        );
      })}
      {present.map((sat) => {
        const med = row[`${sat}Lst`]!;
        const [q1, q3] = row[`${sat}LstIqr`]!;
        const r = R * LANE[sat];
        const [x0, y0] = point(med, r - 7);
        const [x1, y1] = point(med, r + 7);
        const [lx, ly] = point(med, r - 20);
        return (
          <g key={sat}>
            <path d={arc(q1, q3, r)} fill="none" stroke={STROKE[sat]} strokeWidth={sat === "aqua" ? 5 : 3.5} strokeLinecap="butt" opacity={sat === "noaa20" ? 0.7 : 1} />
            <line x1={x0} y1={y0} x2={x1} y2={y1} stroke={STROKE[sat]} strokeWidth={2} />
            <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central" className="dial-label" fill={STROKE[sat]}>
              {SAT_NAMES[sat]} {formatHour(med)}
            </text>
          </g>
        );
      })}
      <text y={-6} textAnchor="middle" className="dial-year">{row.year}</text>
      <text y={16} textAnchor="middle" className="dial-hour">local solar time</text>
    </svg>
  );
}
