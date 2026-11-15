import { useState } from "react";
import { count } from "../lib/format";
import { place } from "./flyover";
import { PLATE, sequential, TOKENS, type RampName } from "../lib/color";
import type { Box, Cells } from "../types";
import type { Column } from "./flyover";

const MAX_HEIGHT = 640;

interface Props {
  cells: Cells;
  columns: Column[];
  max: number;
  bbox: Box;
  ramp: RampName;
  selected: number | null;
  onHover: (c: Column | null) => void;
  onPick: (ci: number) => void;
  width: number;
  label: string;
}

/** The flyover seen from straight above: the same cells and colors, with no height. */
export function FlatCells({ cells, columns, max, bbox, ramp, selected, onHover, onPick, width, label }: Props) {
  const [hovered, setHovered] = useState<number | null>(null);
  const active = columns.find((c) => c.ci === hovered);
  const inspect = (c: Column | null) => { setHovered(c?.ci ?? null); onHover(c); };
  const [w, s, e, n] = bbox;
  const pad = 16;
  const squash = Math.cos((((s + n) / 2) * Math.PI) / 180);
  // Fit the region inside the plate both ways, so a tall region does not run off the screen.
  const scale = Math.min((width - 2 * pad) / (e - w), ((MAX_HEIGHT - 2 * pad) * squash) / (n - s));
  const height = Math.round(((n - s) * scale) / squash + 2 * pad);
  const left = (width - (e - w) * scale) / 2;
  const x = (lon: number) => left + (lon - w) * scale;
  const y = (lat: number) => pad + ((n - lat) * scale) / squash;
  const cw = cells.grid * scale;
  const ch = (cells.grid * scale) / squash;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="group" tabIndex={0} aria-label={label + " Use arrow keys to inspect cells and Enter to open one."}
      onFocus={() => { if (!active && columns.length) inspect(columns[0]); }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && active) { e.preventDefault(); onPick(active.ci); }
        if (e.key === "Escape") inspect(null);
        const direction = ["ArrowRight", "ArrowDown"].includes(e.key) ? 1 : ["ArrowLeft", "ArrowUp"].includes(e.key) ? -1 : 0;
        if (direction && columns.length) {
          e.preventDefault();
          const index = Math.max(0, columns.findIndex((c) => c.ci === hovered));
          inspect(columns[(index + direction + columns.length) % columns.length]);
        }
      }} fontFamily={PLATE.font}
      style={{ display: "block" }} onMouseLeave={() => inspect(null)}>
      <rect width={width} height={height} fill={TOKENS.night} />
      {cells.cells.map(([lat, lon], i) => (
        <rect key={i} x={x(lon) - cw / 2} y={y(lat) - ch / 2} width={cw} height={ch} fill="#16325A" />
      ))}
      {columns.map((c) => (
        <rect className="map-cell" key={c.ci} x={x(c.lon) - cw / 2} y={y(c.lat) - ch / 2} width={cw} height={ch} fill={sequential(Math.sqrt(c.value / max), ramp)}
          stroke={c.ci === selected ? TOKENS.chalk : c.ci === hovered ? TOKENS.sodium : "none"} strokeWidth={2}
          onMouseEnter={() => inspect(c)} onClick={() => { inspect(c); onPick(c.ci); }} />
      ))}
      {active && (
        <g pointerEvents="none" className="chart-inspector" transform="translate(12,12)">
          <rect width={Math.min(280, width - 24)} height={76} rx={3} fill={TOKENS.night} stroke={PLATE.rule} />
          <text x={12} y={22} fill={TOKENS.chalk} fontSize={13} fontFamily="ui-monospace, Consolas, monospace">{place(active.lat, active.lon)}</text>
          <text x={12} y={46} fill={TOKENS.sodium} fontSize={17} fontWeight={600}>{count(active.value)} fire-days</text>
          <text x={12} y={65} fill={PLATE.soft} fontSize={12}>Click or Enter to open this cell's calendar</text>
        </g>
      )}
    </svg>
  );
}
