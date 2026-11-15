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
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} fontFamily={PLATE.font}
      style={{ display: "block" }} onMouseLeave={() => onHover(null)}>
      <rect width={width} height={height} fill={TOKENS.night} />
      {cells.cells.map(([lat, lon], i) => (
        <rect key={i} x={x(lon) - cw / 2} y={y(lat) - ch / 2} width={cw} height={ch} fill="#16325A" />
      ))}
      {columns.map((c) => (
        <rect key={c.ci} x={x(c.lon) - cw / 2} y={y(c.lat) - ch / 2} width={cw} height={ch} fill={sequential(Math.sqrt(c.value / max), ramp)}
          stroke={c.ci === selected ? TOKENS.chalk : "none"} strokeWidth={2}
          onMouseEnter={() => onHover(c)} onClick={() => onPick(c.ci)} />
      ))}
    </svg>
  );
}
