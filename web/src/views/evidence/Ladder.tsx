import { scaleLinear } from "d3-scale";
import { useData } from "../../data/context";
import { PLATE, TOKENS } from "../../lib/color";
import { percent } from "../../lib/format";
import { useWidth } from "../../lib/hooks";
import { TableTwin, type Column } from "../../parts/TableTwin";
import type { LadderRow } from "../../types";
import { AxisBottom, Figure, plateProps } from "./Figure";

export const MODEL_NAMES: Record<string, string> = {
  identity: "No adjustment",
  M0: "One factor for every region",
  M1: "One factor for this region",
  M2: "One factor per season",
  M3: "A curve that bends with the count",
  M4: "Quantile mapping",
};

const name = (model: string) => MODEL_NAMES[model] ?? model;

type Row = LadderRow & { link: string };

const TABLE: Column<Row>[] = [
  { key: "link", label: "Translation", value: (r) => r.link },
  { key: "model", label: "Model", value: (r) => name(r.model) },
  { key: "medApe", label: "Median error", value: (r) => r.medApe, format: (r) => percent(r.medApe, 1) },
  { key: "mae", label: "Mean absolute error", value: (r) => r.mae, format: (r) => r.mae?.toFixed(1) ?? "no data" },
  { key: "r2", label: "R² (log)", value: (r) => r.r2log, format: (r) => r.r2log?.toFixed(2) ?? "no data" },
  { key: "bias", label: "Bias (log)", value: (r) => r.bias, format: (r) => r.bias?.toFixed(3) ?? "no data" },
  { key: "n", label: "Months", value: (r) => r.n },
  { key: "chosen", label: "In use", value: (r) => (r.chosen ? "yes" : "") },
];

const ROW = 34;

function Rungs({ rows, title, width, max }: { rows: LadderRow[]; title: string; width: number; max: number }) {
  const narrow = width < 600;
  const pad = { l: narrow ? 16 : 280, r: 72, t: 44, b: 40 };
  const rowH = narrow ? ROW + 18 : ROW;
  const height = pad.t + rows.length * rowH + pad.b;
  const x = scaleLinear().domain([0, max]).nice().range([pad.l, width - pad.r]);
  return (
    <svg {...plateProps(width, height, `${title}: held-out median error for each model. The table below has the numbers.`)}>
      <rect width={width} height={height} fill={TOKENS.night} />
      <text x={16} y={24} fontSize={15} fontWeight={600} fill={PLATE.ink}>{title}</text>
      <AxisBottom scale={x} ticks={x.ticks(5)} y={height - pad.b} format={(v) => percent(v)} />
      {rows.map((r, i) => {
        const cy = pad.t + i * rowH + (narrow ? 30 : rowH / 2);
        const label = `${name(r.model)}${r.chosen ? ", in use" : ""}`;
        return (
          <g key={r.model}>
            <line x1={pad.l} x2={width - pad.r} y1={cy} y2={cy} stroke={PLATE.rule} strokeOpacity={0.35} />
            <text x={narrow ? 16 : pad.l - 16} y={narrow ? cy - 14 : cy + 4} fontSize={13} textAnchor={narrow ? "start" : "end"} fontWeight={r.chosen ? 700 : 400} fill={r.chosen ? PLATE.ink : PLATE.soft}>{label}</text>
            {r.medApe != null && (
              <>
                <circle cx={x(r.medApe)} cy={cy} r={r.chosen ? 7 : 5} fill={r.chosen ? TOKENS.chalk : TOKENS.night} stroke={TOKENS.chalk} strokeWidth={1.5} />
                <text x={x(r.medApe) + 13} y={cy + 4} fontSize={13} fontWeight={r.chosen ? 700 : 400} fill={PLATE.ink}>{percent(r.medApe, 1)}</text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function Ladder() {
  const { validation: v, region } = useData();
  const [wrap, width] = useWidth<HTMLDivElement>(1000);
  const chosen = v.ladder.find((r) => r.chosen);
  const global = v.ladder.find((r) => r.model === "M0");
  const chosen2 = v.ladderLink2.find((r) => r.chosen);
  if (!chosen || !global) return null;

  const max = Math.max(...[...v.ladder, ...v.ladderLink2].map((r) => r.medApe ?? 0));
  const beats = chosen.model !== "M0" && (chosen.medApe ?? 1) < (global.medApe ?? 0);
  const finding = beats
    ? `Tested on years it never saw, the model in use misses by ${percent(chosen.medApe, 1)} in a typical month. One global factor misses by ${percent(global.medApe, 1)}.`
    : `Tested on years it never saw, nothing beat one global factor in ${region.name}: it misses by ${percent(global.medApe, 1)} in a typical month.`;
  const rows: Row[] = [...v.ladder.map((r) => ({ ...r, link: "Aqua to S-NPP" })), ...v.ladderLink2.map((r) => ({ ...r, link: "NOAA-20 to S-NPP" }))];
  const widened = v.intervalScale > 1.001;

  return (
    <Figure n={3} id="ladder" finding={finding}
      how="Each row is one way of translating a satellite's monthly count to S-NPP's scale, from simplest to most flexible. The dot is its median error when each year is held out in turn and predicted from the others. Further left is better. The filled dot is the one Overpass uses."
      mind="A simpler model matching the chosen one within a percentage point would mean the extra flexibility is not earning its keep; we would then use the simpler model.">
      <div ref={wrap} className="plate figure-stack">
        <Rungs rows={v.ladder} title={`Aqua to S-NPP, ${chosen.n} overlap months`} width={width} max={max} />
        <Rungs rows={v.ladderLink2} title={`NOAA-20 to S-NPP, ${chosen2?.n ?? 0} overlap months`} width={width} max={max} />
      </div>
      <p className="figure-note">
        Held out, the 90% interval for Aqua to S-NPP covered {percent(v.coverage90Raw)} of months
        {widened ? `, so every interval was widened ×${v.intervalScale.toFixed(2)} to reach ${percent(v.coverage90)}. The widening is fitted on the same held-out months it is scored on.` : "."}
        {" "}For NOAA-20 to S-NPP the interval covers {percent(v.coverage90Link2)}.
        {v.pooledRegions.length > 1 ? ` The global factor is fitted on ${v.pooledRegions.length} regions pooled; it will move as more are added.` : ""}
      </p>
      <TableTwin caption="Held-out error for each model" columns={TABLE} rows={rows} collapsible />
    </Figure>
  );
}
