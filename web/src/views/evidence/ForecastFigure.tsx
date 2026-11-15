import { scaleLinear } from "d3-scale";
import { useData } from "../../data/context";
import { loadForecast, useLoad } from "../../data/load";
import { PLATE, TOKENS } from "../../lib/color";
import { percent } from "../../lib/format";
import { useWidth } from "../../lib/hooks";
import { Waiting } from "../../parts/Finding";
import { AxisBottom, Figure, plateProps } from "./Figure";

/** Figure 7: the next-month forecast against the two simple forecasts it has to beat. */
export function ForecastFigure() {
  const { region } = useData();
  const file = useLoad(`forecast:${region.id}`, () => loadForecast(region.id));
  const [wrap, width] = useWidth<HTMLDivElement>(720);
  if (file.state !== "ready" || !file.data) return <Waiting what="Forecast test" error={file.state === "error" ? file.message : undefined} />;

  const { skill, shown, horizonMonths } = file.data;
  const rows = [
    { label: "This forecast", value: skill.model, ours: true },
    { label: "The normal month", value: skill.climatology, ours: false },
    { label: "Latest anomaly carried forward", value: skill.persistence, ours: false },
  ];
  const labelW = width < 520 ? 0 : 240;
  const rowH = width < 520 ? 52 : 36;
  const top = 12;
  const height = top + rows.length * rowH + 40;
  const x = scaleLinear().domain([0, Math.max(...rows.map((r) => r.value)) * 1.15]).nice().range([labelW + 8, width - 24]);
  const finding = shown
    ? `A forecast made ${horizonMonths} months ahead missed by ${percent(skill.model)} in a typical month, against ${percent(skill.climatology)} for the normal month, so This month shows it.`
    : `A forecast made ${horizonMonths} months ahead missed by ${percent(skill.model)} in a typical month, no better than the normal month (${percent(skill.climatology)}), so it is not shown.`;

  return (
    <Figure n={7} id="forecast" finding={finding}
      how={<>Each month from {skill.backtest.replace("..", " to ")} was forecast using only the record up to {horizonMonths} months before, with the model refitted once a year. Bars are the median miss as a share of the true value, {skill.months} months in all. Shorter is better.</>}
      mind="A forecast that missed by more than the normal month. It would then be hidden, as it is wherever that happens.">
      <div ref={wrap} className="plate">
        <svg {...plateProps(width, height, `Typical forecast miss: this forecast ${percent(skill.model)}, the normal month ${percent(skill.climatology)}, latest anomaly carried forward ${percent(skill.persistence)}.`)}>
          <rect width={width} height={height} fill={TOKENS.night} />
          {rows.map((r, i) => {
            const y = top + i * rowH;
            const barY = labelW ? y + 6 : y + 22;
            return (
              <g key={r.label}>
                <text x={labelW ? labelW : x(0)} y={labelW ? y + 19 : y + 14} fontSize={13} textAnchor={labelW ? "end" : "start"} fill={r.ours ? PLATE.ink : PLATE.soft}>{r.label}</text>
                <rect x={x(0)} y={barY} width={x(r.value) - x(0)} height={18} fill={TOKENS.chalk} opacity={r.ours ? 1 : 0.45} />
                <text x={x(r.value) + 6} y={barY + 14} fontSize={13} fill={PLATE.ink}>{percent(r.value)}</text>
              </g>
            );
          })}
          <AxisBottom scale={x} ticks={x.ticks(4)} y={top + rows.length * rowH + 4} format={(v) => percent(v)} />
        </svg>
      </div>
    </Figure>
  );
}
