import { useCallback, useId, useMemo, useState, type KeyboardEvent } from "react";
import { diverging, PLATE, sequential, TOKENS, type RampName } from "../lib/color";
import { count, monthLabel, MONTH_INITIALS, toYm } from "../lib/format";
import type { CellValue } from "../lib/series";
import { normalsAt, relativeWidth, valueAt, type Handoff } from "./calendarModel";

export const PLATE_ID = "calendar-plate";
/** Hatch spacing in px for narrow, medium and wide intervals. */
const HATCH = [9, 6, 4];
const compactTotal = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const hatchLevel = (rel: number) => (rel < 0.35 ? 0 : rel < 0.7 ? 1 : 2);

interface Props {
  /** months in the visible range */
  months: CellValue[];
  /** the whole record, so color and bar scales do not move with the range slider */
  record: CellValue[];
  /** 0 = raw records, 1 = harmonized */
  k: number;
  color: "counts" | "normal";
  ramp: RampName;
  handoffs: Handoff[];
  criticalMonths: number[];
  active: string | null;
  onActive: (ym: string | null) => void;
  width: number;
  compact: boolean;
  label: string;
  unit?: string;
}

export function CalendarPlate({ months, record, k, color, ramp, handoffs, criticalMonths, active, onActive, width, compact, label, unit = "fire-days" }: Props) {
  const hatchId = useId();
  const years = useMemo(() => [...new Set(months.map((m) => m.year))], [months]);
  const byYm = useMemo(() => new Map(months.map((m) => [m.ym, m])), [months]);
  const [pinned, setPinned] = useState<string | null>(null);
  const pin = pinned && byYm.has(pinned) ? pinned : null;
  const inspect = useCallback((ym: string | null) => { if (!pin) onActive(ym); }, [pin, onActive]);
  const togglePin = useCallback((ym: string) => {
    setPinned((previous) => previous === ym ? null : ym);
    onActive(ym);
  }, [onActive]);
  const scaleMax = useMemo(() => Math.max(1, ...record.map((m) => Math.max(m.raw ?? 0, m.harmonized))), [record]);
  const normals = useMemo(() => normalsAt(record, k), [record, k]);
  const lastYm = record[record.length - 1].ym;

  const pad = compact ? 8 : 16;
  const labelW = compact ? 36 : 52;
  const totalsW = compact ? 70 : Math.min(260, width * 0.2);
  const cellW = (width - 2 * pad - labelW - totalsW) / 12;
  const rowH = compact ? 20 : 22;
  const climH = compact ? 36 : 52;
  const ruleH = 22;
  const gridX = pad + labelW;
  const gridTop = pad + climH + 24;

  const { rows, rules, height } = useMemo(() => {
    const rows: { year: number; y: number }[] = [];
    const rules: { y: number; label: string }[] = [];
    let y = gridTop;
    for (const year of years) {
      const above = handoffs.find((h) => h.year === year && h.place === "above");
      if (above) {
        rules.push({ y: y + ruleH / 2, label: above.label });
        y += ruleH;
      }
      rows.push({ year, y });
      y += rowH;
      const below = handoffs.find((h) => h.year === year && h.place === "below");
      if (below) {
        rules.push({ y: y + ruleH / 2, label: below.label });
        y += ruleH;
      }
    }
    return { rows, rules, height: y + pad };
  }, [gridTop, handoffs, pad, rowH, ruleH, years]);

  const yearly = useMemo(() => {
    const summary = new Map<number, { raw: number; harmonized: number; months: number; partial: boolean }>();
    for (const m of months) {
      const totals = summary.get(m.year) ?? { raw: 0, harmonized: 0, months: 0, partial: false };
      totals.raw += m.raw ?? m.harmonized;
      totals.harmonized += m.harmonized;
      totals.months++;
      totals.partial ||= m.partial;
      summary.set(m.year, totals);
    }
    return summary;
  }, [months]);
  const totalMax = useMemo(() => {
    const by = new Map<number, [number, number]>();
    for (const m of record) {
      const t = by.get(m.year) ?? [0, 0];
      by.set(m.year, [t[0] + (m.raw ?? m.harmonized), t[1] + m.harmonized]);
    }
    return Math.max(1, ...[...by.values()].flat());
  }, [record]);
  const climMax = useMemo(() => Math.max(1, ...normalsAt(record, 0).map((v) => v ?? 0), ...normalsAt(record, 1).map((v) => v ?? 0)), [record]);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") { setPinned(null); onActive(null); return; }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      togglePin(active ?? months[months.length - 1].ym);
      return;
    }
    const step: Record<string, [number, number]> = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
    const move = step[e.key];
    if (!move) return;
    e.preventDefault();
    const from = byYm.get(active ?? "") ?? months[months.length - 1];
    const month0 = from.month - 1 + move[1];
    const year = from.year + move[0] + Math.floor(month0 / 12);
    const next = byYm.get(toYm(year, ((month0 % 12) + 12) % 12 + 1));
    if (next) { setPinned(null); onActive(next.ym); }
  };

  const barX = gridX + 12 * cellW + 8;
  const barW = totalsW - 8 - (compact ? 34 : 52);
  const marks = useMemo(() => {
    const text = { fontSize: 13, fill: PLATE.soft };
    const fill = (m: CellValue): string => {
      const v = valueAt(m, k);
      if (color === "counts") return sequential(Math.sqrt(v / scaleMax), ramp);
      const normal = normals[m.month - 1];
      if (!normal || v <= 0) return v <= 0 ? diverging(-1) : TOKENS.plateMid;
      return diverging(Math.log2(v / normal) / 2);
    };

    return (<>

      <defs>
        {HATCH.map((gap, i) => (
          <pattern key={gap} id={`${hatchId}-${i}`} width={gap} height={gap} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1={0} y1={0} x2={0} y2={gap} stroke={TOKENS.chalk} strokeWidth={1} />
          </pattern>
        ))}
      </defs>
      <rect width={width} height={height} fill={TOKENS.night} />

      {normals.map((v, i) => {
        const h = v == null ? 0 : (v / climMax) * climH;
        const critical = criticalMonths.includes(i + 1);
        const cx = gridX + (i + 0.5) * cellW;
        return (
          <g key={i}>
            <rect x={gridX + i * cellW + 1} y={pad + climH - h} width={cellW - 2} height={h} fill={TOKENS.chalk} opacity={0.85} />
            <text x={cx} y={pad + climH + 15} textAnchor="middle" {...text} fill={critical ? TOKENS.chalk : PLATE.soft} fontWeight={critical ? 800 : 400}>
              {MONTH_INITIALS[i]}
            </text>
            {critical && <line x1={cx - 5} x2={cx + 5} y1={pad + climH + 19} y2={pad + climH + 19} stroke={TOKENS.chalk} strokeWidth={1.5} />}
          </g>
        );
      })}
      {!compact && (
        <text x={barX} y={pad + climH - 4} {...text}>
          <tspan x={barX} dy={-16}>Median by month.</tspan>
          <tspan x={barX} dy={16}>Underlined: fire season.</tspan>
        </text>
      )}

      {rows.map(({ year, y: ry }) => {
        const total = yearly.get(year)!;
        const value = total.raw + (total.harmonized - total.raw) * k;
        const bar = Math.max(1, (value / totalMax) * barW);
        return (
        <g key={year}>
          <text x={gridX - 8} y={ry + rowH / 2} textAnchor="end" dominantBaseline="central" {...text}>{year}</text>
          {Array.from({ length: 12 }, (_, i) => {
            const m = byYm.get(toYm(year, i + 1));
            if (!m) return null;
            const x = gridX + i * cellW + 1;
            const rel = relativeWidth(m);
            return (
              <g className="calendar-cell" key={i} onMouseEnter={() => inspect(m.ym)} onClick={() => togglePin(m.ym)}>
                <rect x={x} y={ry + 1} width={cellW - 2} height={rowH - 2} fill={fill(m)} />
                {rel > 0 && k > 0 && <rect x={x} y={ry + 1} width={cellW - 2} height={rowH - 2} fill={`url(#${hatchId}-${hatchLevel(rel)})`} opacity={0.3 * k} pointerEvents="none" />}
                {m.partial && <rect x={x + 1} y={ry + 2} width={cellW - 4} height={rowH - 4} fill="none" stroke={m.ym === lastYm ? TOKENS.sodium : PLATE.rule} strokeWidth={1.5} strokeDasharray={m.ym === lastYm ? undefined : "3 2"} pointerEvents="none" />}
              </g>
            );
          })}
          <rect x={barX} y={ry + 5} width={bar} height={rowH - 10}
            fill={total.months === 12 && !total.partial ? TOKENS.chalk : "none"} stroke={TOKENS.chalk} strokeWidth={1} opacity={0.85} />
          <text x={barX + bar + 6} y={ry + rowH / 2} dominantBaseline="central" {...text}>
            {compact ? compactTotal.format(value) : count(Math.round(value))}
          </text>
        </g>
        );
      })}

      {rules.map((r) => (
        <g key={r.label}>
          <line x1={pad} x2={width - pad} y1={r.y} y2={r.y} stroke={TOKENS.chalk} strokeOpacity={0.5} strokeWidth={1} strokeDasharray="5 4" />
          <rect x={gridX + 4} y={r.y - 9} width={r.label.length * 6.9 + 12} height={18} fill={TOKENS.night} />
          <text x={gridX + 10} y={r.y} dominantBaseline="central" fontSize={13} fill={PLATE.ink}>{r.label}</text>
        </g>
      ))}

    </>);
  }, [barW, barX, byYm, cellW, climH, climMax, color, compact, criticalMonths, gridX, hatchId,
    height, k, lastYm, normals, inspect, togglePin, pad, ramp, rowH, rows, rules, scaleMax, totalMax, width, yearly]);

  return (
    <svg id={PLATE_ID} width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="group" tabIndex={0} aria-label={label + " Enter or click pins a month; Escape releases it."}
      fontFamily={PLATE.font} style={{ display: "block", maxWidth: "100%", height: "auto", fontVariantNumeric: "tabular-nums" }}
      onKeyDown={onKey} onMouseLeave={() => inspect(null)} onFocus={() => onActive(pin ?? active ?? months[months.length - 1].ym)}>
      {marks}
      {(() => {
        const m = byYm.get(pin ?? active ?? "");
        const row = m && rows.find((r) => r.year === m.year);
        if (!m || !row) return null;
        const cx = gridX + (m.month - 1) * cellW;
        const tipW = Math.min(250, width - 16);
        const tipX = Math.min(width - tipW - 8, Math.max(8, cx + cellW / 2 - tipW / 2));
        const tipY = row.y > 100 ? row.y - 83 : row.y + rowH + 8;
        return (
          <g pointerEvents="none">
            <rect x={gridX} y={row.y} width={cellW * 12} height={rowH} fill="none" stroke={PLATE.rule} />
            <rect x={cx} y={gridTop} width={cellW} height={height - gridTop - pad} fill="none" stroke={PLATE.rule} />
            <rect x={cx} y={row.y} width={cellW} height={rowH} fill="none" stroke={TOKENS.sodium} strokeWidth={2} />
            <g className="chart-inspector" transform={"translate(" + tipX + "," + tipY + ")"}>
              <rect width={tipW} height={74} rx={3} fill={TOKENS.night} stroke={PLATE.rule} />
              <text x={12} y={20} fill={TOKENS.chalk} fontSize={13}>{monthLabel(m.ym)}{pin ? " · pinned" : ""}</text>
              <text x={12} y={43} fill={TOKENS.sodium} fontSize={17} fontWeight={600} fontFamily="ui-monospace, Consolas, monospace">{count(Math.round(valueAt(m, k)))} {unit}</text>
              <text x={12} y={62} fill={PLATE.soft} fontSize={12}>{pin ? "Click again or Esc to release" : "Click or Enter to pin this month"}</text>
            </g>
          </g>
        );
      })()}
    </svg>
  );
}
