import { useMemo } from "react";
import { PLATE, sequential, TOKENS, type RampName } from "../lib/color";
import { count, MONTH_INITIALS, monthLabel, ymParts } from "../lib/format";
import { useWidth } from "../lib/hooks";
import type { Cells } from "../types";
import type { Handoff } from "../views/calendarModel";
import { cellSeries, place } from "./flyover";

interface Props {
  cells: Cells;
  ci: number;
  ramp: RampName;
  handoffs: Handoff[];
  /** the month the scrubber is on, outlined */
  ym: string;
  onClose: () => void;
}

/** One grid cell's whole record as a small calendar. */
export function MiniCalendar({ cells, ci, ramp, handoffs, ym, onClose }: Props) {
  const [wrap, width] = useWidth<HTMLDivElement>(560);
  const series = useMemo(() => cellSeries(cells, ci), [cells, ci]);
  const [lat, lon] = cells.cells[ci];
  const first = ymParts(cells.months[0]).year;
  const last = ymParts(cells.months[cells.months.length - 1]).year;
  const max = Math.max(...series);
  const peak = cells.months[series.indexOf(max)];
  const total = series.reduce((a, v) => a + v, 0);

  const labelW = 44;
  const noteW = width < 520 ? 0 : 220;
  const cellW = Math.min(34, (width - labelW - noteW - 16) / 12);
  const rowH = 14;
  const top = 24;
  const height = top + (last - first + 1) * rowH + 12;
  const gx = (col: number) => labelW + col * cellW;
  const gy = (year: number) => top + (year - first) * rowH;

  return (
    <section className="mini" aria-live="polite">
      <div className="mini-head">
        <h2 className="finding-sentence">
          Cell at {place(lat, lon)}: {count(Math.round(total))} fire-days since {first}, most in {monthLabel(peak, true)}.
        </h2>
        <button type="button" className="btn" onClick={onClose}>Close cell</button>
      </div>
      <div ref={wrap} className="plate mini-plate">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" fontFamily={PLATE.font} style={{ display: "block" }}
          aria-label={`Calendar of monthly fire-days for the cell at ${place(lat, lon)}, ${first} to ${last}. Brightest month: ${monthLabel(peak, true)} with ${max.toFixed(1)}.`}>
          <rect width={width} height={height} fill={TOKENS.night} />
          {MONTH_INITIALS.map((m, i) => (
            <text key={i} x={gx(i + 0.5)} y={16} fontSize={13} textAnchor="middle" fill={PLATE.soft}>{m}</text>
          ))}
          {cells.months.map((month, i) => {
            const p = ymParts(month);
            return (
              <rect key={month} x={gx(p.month - 1) + 0.5} y={gy(p.year) + 0.5} width={cellW - 1} height={rowH - 1}
                fill={series[i] > 0 ? sequential(Math.sqrt(series[i] / max), ramp) : "#16325A"}
                stroke={month === ym ? TOKENS.chalk : "none"} strokeWidth={1.5} />
            );
          })}
          {Array.from({ length: last - first + 1 }, (_, j) => first + j).filter((year) => year % 5 === 0 || year === first).map((year) => (
            <text key={year} x={labelW - 8} y={gy(year) + rowH - 3} fontSize={13} textAnchor="end" fill={PLATE.soft}>{year}</text>
          ))}
          {handoffs.map((h) => {
            const { year, month } = ymParts(h.ym);
            const col = month - 1;
            const d = col === 0
              ? `M${gx(0)},${gy(year)}H${gx(12)}`
              : `M${gx(0)},${gy(year + 1)}H${gx(col)}V${gy(year)}H${gx(12)}`;
            return (
              <g key={h.ym}>
                <path d={d} fill="none" stroke={TOKENS.chalk} strokeOpacity={0.5} strokeWidth={1} strokeDasharray="4 3" />
                {noteW > 0 && <text x={gx(12) + 8} y={gy(year) + 4} fontSize={13} fill={PLATE.soft}>{h.label}</text>}
              </g>
            );
          })}
        </svg>
      </div>
      <p className="fine">
        Colors run from this cell's quietest month to its busiest, {max.toFixed(1)} fire-days. A cell's values are its share of the region's harmonized total.
      </p>
    </section>
  );
}
