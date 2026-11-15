import type { ReactNode } from "react";
import { PLATE } from "../../lib/color";
import { Finding } from "../../parts/Finding";

interface Props {
  n: number;
  id: string;
  finding: string;
  how: ReactNode;
  /** what result would count against the method */
  mind: string;
  children: ReactNode;
}

export function Figure({ n, id, finding, how, mind, children }: Props) {
  return (
    <section id={id} className="figure" aria-label={`Figure ${n}`}>
      <Finding level="h2" how={how}>{`${n}. ${finding}`}</Finding>
      {children}
      <p className="figure-mind"><strong>What would change our mind.</strong> {mind}</p>
    </section>
  );
}

interface Scale {
  (v: number): number;
}

export function AxisBottom({ scale, ticks, y, format = String }: { scale: Scale; ticks: number[]; y: number; format?: (v: number) => string }) {
  return (
    <g>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={scale(t)} x2={scale(t)} y1={y} y2={y + 6} stroke={PLATE.rule} />
          <text x={scale(t)} y={y + 22} fontSize={13} fill={PLATE.soft} textAnchor="middle">{format(t)}</text>
        </g>
      ))}
    </g>
  );
}

export function AxisLeft({ scale, ticks, x, format = String }: { scale: Scale; ticks: number[]; x: number; format?: (v: number) => string }) {
  return (
    <g>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x - 6} x2={x} y1={scale(t)} y2={scale(t)} stroke={PLATE.rule} />
          <text x={x - 10} y={scale(t) + 4} fontSize={13} fill={PLATE.soft} textAnchor="end">{format(t)}</text>
        </g>
      ))}
    </g>
  );
}

/** Shared attributes for a plate SVG. */
export function plateProps(width: number, height: number, label: string) {
  return { width, height, role: "img", "aria-label": label, fontFamily: PLATE.font, style: { display: "block", fontVariantNumeric: "tabular-nums" } } as const;
}
