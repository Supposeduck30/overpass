import { scaleLinear } from "d3-scale";
import { useData } from "../../data/context";
import { PLATE, TOKENS } from "../../lib/color";
import { percent } from "../../lib/format";
import { useWidth } from "../../lib/hooks";
import { TableTwin, type Column } from "../../parts/TableTwin";
import type { UnitRow } from "../../types";
import { AxisBottom, Figure, plateProps } from "./Figure";

const TABLE: Column<UnitRow>[] = [
  { key: "unit", label: "Unit", value: (r) => r.unit },
  { key: "cv", label: "Spread of the monthly rate (CV)", value: (r) => r.cv, format: (r) => r.cv?.toFixed(3) ?? "no data" },
  { key: "sd", label: "SD of log rate", value: (r) => r.sdLog, format: (r) => r.sdLog?.toFixed(3) ?? "no data" },
  { key: "sat", label: "Burning cell-days used in the peak month", value: (r) => r.saturation, format: (r) => (r.saturation == null ? "does not apply" : percent(r.saturation, 1)) },
  { key: "months", label: "Months", value: (r) => r.months },
  { key: "chosen", label: "In use", value: (r) => (r.chosen ? "yes" : "") },
];

export function Units() {
  const { validation: v } = useData();
  const [wrap, width] = useWidth<HTMLDivElement>(1000);
  const rows = v.units.filter((u) => u.cv != null);
  const chosen = rows.find((u) => u.chosen);
  const steadiest = rows.find((u) => u.steadiest) ?? chosen;
  if (!chosen || !steadiest) return null;

  const same = steadiest.column === chosen.column;
  const finding = same
    ? `The unit in use, ${chosen.unit}, gives the steadiest month-to-month exchange rate of the ${rows.length} tried (CV ${chosen.cv!.toFixed(2)}).`
    : `The unit in use is not the steadiest here: ${steadiest.unit} varies a little less from month to month (CV ${steadiest.cv!.toFixed(2)} against ${chosen.cv!.toFixed(2)} for ${chosen.unit}).`;

  const narrow = width < 600;
  const pad = { l: narrow ? 16 : 280, r: narrow ? 56 : 200, t: 20, b: 40 };
  const rowH = narrow ? 52 : 34;
  const height = pad.t + rows.length * rowH + pad.b;
  const x = scaleLinear().domain([0, Math.max(...rows.map((u) => u.cv!))]).nice().range([pad.l, width - pad.r]);

  return (
    <Figure n={4} id="units" finding={finding}
      how="Each row is one way of counting fire. The dot shows how much the S-NPP to Aqua ratio wobbles from month to month in that unit: further left is steadier, and a steadier ratio is easier to translate. The share on the right is how full the busiest month was: of all the days its burning cells could have counted, the part they did count. Near 100% the unit can no longer tell a big month from a bigger one."
      mind="A unit that was clearly steadier everywhere, not by a hundredth in one region, would be a reason to switch. The spec fixed 0.25° fire-days before the data was seen, so we report the comparison and do not switch on a small margin.">
      <div ref={wrap} className="plate">
        <svg {...plateProps(width, height, "Month-to-month spread of the S-NPP to Aqua ratio for each counting unit. The table below has the numbers.")}>
          <rect width={width} height={height} fill={TOKENS.night} />
          <AxisBottom scale={x} ticks={x.ticks(5)} y={height - pad.b} format={(t) => t.toFixed(2)} />
          {rows.map((u, i) => {
            const cy = pad.t + i * rowH + (narrow ? 34 : rowH / 2);
            const label = `${u.unit}${u.chosen ? ", in use" : ""}`;
            return (
              <g key={u.column}>
                <line x1={pad.l} x2={width - pad.r} y1={cy} y2={cy} stroke={PLATE.rule} strokeOpacity={0.35} />
                <text x={narrow ? 16 : pad.l - 16} y={narrow ? cy - 14 : cy + 4} fontSize={13} textAnchor={narrow ? "start" : "end"} fontWeight={u.chosen ? 700 : 400} fill={u.chosen ? PLATE.ink : PLATE.soft}>{label}</text>
                <circle cx={x(u.cv!)} cy={cy} r={u.chosen ? 7 : 5} fill={u.chosen ? TOKENS.chalk : TOKENS.night} stroke={TOKENS.chalk} strokeWidth={1.5} />
                <text x={x(u.cv!) + 13} y={cy + 4} fontSize={13} fontWeight={u.chosen ? 700 : 400} fill={PLATE.ink}>{u.cv!.toFixed(2)}</text>
                {!narrow && u.saturation != null && (
                  <text x={width - 16} y={cy + 4} fontSize={13} textAnchor="end" fill={PLATE.soft}>{percent(u.saturation, 1)} full at the peak</text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <p className="figure-note">
        CV is the spread of the monthly ratio relative to its mean, from the standard deviation of its logarithm, over {chosen.months} overlap months with enough fire to form a ratio.
        Coarser cells fill up faster in the busiest month, which is why the grid is not made larger to smooth the ratio.
      </p>
      <TableTwin caption="Steadiness and saturation for each counting unit" columns={TABLE} rows={v.units} collapsible />
    </Figure>
  );
}
