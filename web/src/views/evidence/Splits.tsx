import { scaleLinear, scaleSqrt } from "d3-scale";
import { useData } from "../../data/context";
import { PLATE, TOKENS } from "../../lib/color";
import { count, monthLabel, percent, signed, ymParts } from "../../lib/format";
import { useWidth } from "../../lib/hooks";
import { TableTwin, type Column } from "../../parts/TableTwin";
import type { SplitPoint, SplitTest } from "../../types";
import { AxisBottom, AxisLeft, Figure, plateProps } from "./Figure";

const TABLE: Column<SplitPoint>[] = [
  { key: "ym", label: "Month", value: (r) => r.ym, format: (r) => monthLabel(r.ym) },
  { key: "source", label: "Aqua counted", value: (r) => r.source, format: (r) => count(r.source) },
  { key: "pred", label: "Predicted", value: (r) => r.pred, format: (r) => count(Math.round(r.pred)) },
  { key: "lo", label: "Low", value: (r) => r.lo, format: (r) => count(Math.round(r.lo)) },
  { key: "hi", label: "High", value: (r) => r.hi, format: (r) => count(Math.round(r.hi)) },
  { key: "actual", label: "S-NPP counted", value: (r) => r.actual, format: (r) => count(r.actual) },
  { key: "inside", label: "Inside interval", value: (r) => (r.actual >= r.lo && r.actual <= r.hi ? "yes" : "no") },
];

const span = (s: string) => s.replace("-", "–");

function SplitChart({ test, width, title }: { test: SplitTest; width: number; title: string }) {
  const height = 300;
  const pad = { l: 64, r: 32, t: 40, b: 40 };
  const t = (ym: string) => ymParts(ym).year + (ymParts(ym).month - 0.5) / 12;
  const x = scaleLinear().domain([Math.floor(t(test.points[0].ym)), Math.ceil(t(test.points[test.points.length - 1].ym))]).range([pad.l, width - pad.r]);
  const y = scaleSqrt().domain([0, Math.max(...test.points.map((p) => Math.max(p.hi, p.actual)))]).nice().range([height - pad.b, pad.t]);
  const [y0, y1] = x.domain();
  return (
    <svg {...plateProps(width, height, `${title}: predicted and actual monthly fire-days. The table below has the numbers.`)}>
      <rect width={width} height={height} fill={TOKENS.night} />
      <text x={pad.l} y={22} fontSize={15} fontWeight={600} fill={PLATE.ink}>{title}</text>
      <AxisLeft scale={y} ticks={y.ticks(5)} x={pad.l} format={count} />
      <AxisBottom scale={x} ticks={Array.from({ length: y1 - y0 + 1 }, (_, i) => y0 + i)} y={height - pad.b} />
      {test.points.map((p) => {
        const inside = p.actual >= p.lo && p.actual <= p.hi;
        const cx = x(t(p.ym));
        return (
          <g key={p.ym}>
            <line x1={cx} x2={cx} y1={y(p.lo)} y2={y(p.hi)} stroke={TOKENS.chalk} strokeOpacity={0.45} strokeWidth={Math.max(2, (width - pad.l - pad.r) / test.points.length - 6)} />
            <line x1={cx - 5} x2={cx + 5} y1={y(p.pred)} y2={y(p.pred)} stroke={TOKENS.chalk} strokeWidth={1.5} />
            <circle cx={cx} cy={y(p.actual)} r={inside ? 3 : 4.5} fill={inside ? TOKENS.night : TOKENS.lightBlue} stroke={inside ? TOKENS.chalk : TOKENS.lightBlue} strokeWidth={1.5} />
          </g>
        );
      })}
    </svg>
  );
}

function sentence(test: SplitTest): string {
  return `trained on ${span(test.train)}, it predicted ${span(test.test)} with a median error of ${percent(test.medApe)}, and ${percent(test.coverage90)} of ${test.n} months fell inside the 90% interval`;
}

export function Splits() {
  const { validation } = useData();
  const [wrap, width] = useWidth<HTMLDivElement>(1000);
  const { backward, forward } = validation;
  const short = [backward, forward].filter((s) => s.coverage90 < 0.9);
  const finding = `Run backward in time, ${sentence(backward)}.${short.length ? ` That is short of the 90% the interval promises${short.length === 2 ? ", in both directions" : ""}.` : ""}`;
  const miss = (s: SplitTest) => s.points.filter((p) => p.actual < p.lo || p.actual > p.hi).length;

  return (
    <Figure n={2} id="backward" finding={finding}
      how="Each bar is the 90% interval Overpass predicted for one month from Aqua's count alone, with a dash at its best guess. The dot is what S-NPP actually counted. Filled blue dots fell outside the interval. The vertical scale is compressed so quiet months stay readable."
      mind="Coverage far below 90%, or misses that all fall on one side, would mean the Aqua to S-NPP relationship changed over the years it is being stretched across.">
      <div ref={wrap} className="plate figure-stack">
        <SplitChart test={backward} width={width} title={width < 600 ? `Backward test, ${span(backward.test)}` : `Backward: trained on ${span(backward.train)}, tested on ${span(backward.test)}`} />
        <SplitChart test={forward} width={width} title={width < 600 ? `Forward test, ${span(forward.test)}` : `Forward: trained on ${span(forward.train)}, tested on ${span(forward.test)}`} />
      </div>
      <p className="figure-note">
        Forward, {sentence(forward)}. Misses: {miss(backward)} of {backward.n} backward, {miss(forward)} of {forward.n} forward.
        Bias on the log scale: {backward.bias == null ? "no data" : signed(backward.bias, 2)} backward, {forward.bias == null ? "no data" : signed(forward.bias, 2)} forward (0 is unbiased).
        {backward.intervalScale != null && backward.coverage90Unwidened != null
          ? `Before widening, coverage was ${Math.round(backward.coverage90Unwidened * 100)}% backward and ${Math.round((forward.coverage90Unwidened ?? forward.coverage90) * 100)}% forward. Each test widens its intervals by a factor learned from leave-one-year-out checks inside its own training years (×${backward.intervalScale.toFixed(2)} backward, ×${(forward.intervalScale ?? 1).toFixed(2)} forward), so the test years never set the width.`
          : "These tests use intervals as first fitted, before the widening described in figure 3."}
      </p>
      <TableTwin caption={`Backward test, ${span(backward.test)}`} columns={TABLE} rows={backward.points} collapsible />
    </Figure>
  );
}
