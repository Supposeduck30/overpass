import { scaleLinear } from "d3-scale";
import { useMemo } from "react";
import { useData } from "../../data/context";
import { pettittOf, seamSteps } from "../../data/guards";
import { PLATE, TOKENS } from "../../lib/color";
import { count, monthLabel, pValue, ymParts } from "../../lib/format";
import { useWidth } from "../../lib/hooks";
import { cellValues, yearTotals, type YearTotal } from "../../lib/series";
import { TableTwin, type Column } from "../../parts/TableTwin";
import type { Step } from "../../types";
import { handoffs } from "../calendarModel";
import { AxisBottom, AxisLeft, Figure, plateProps } from "./Figure";

const ratio = (s: Step) => `×${Math.exp(s.step).toFixed(2)} (×${Math.exp(s.lo).toFixed(2)} to ×${Math.exp(s.hi).toFixed(2)})`;

const TABLE: Column<YearTotal>[] = [
  { key: "year", label: "Year", value: (r) => r.year },
  { key: "raw", label: "As recorded", value: (r) => r.raw, format: (r) => count(r.raw == null ? null : Math.round(r.raw)) },
  { key: "harmonized", label: "Harmonized", value: (r) => r.harmonized, format: (r) => count(Math.round(r.harmonized)) },
];

export function Seam() {
  const { monthly, validation } = useData();
  const [wrap, width] = useWidth<HTMLDivElement>(1000);
  const months = useMemo(() => cellValues(monthly, "fd"), [monthly]);
  const years = useMemo(() => yearTotals(months).filter((y) => y.complete), [months]);
  const rules = useMemo(() => handoffs(months), [months]);

  const seam = seamSteps(validation)[0];
  const pettitt = pettittOf(validation);
  if (!seam || !years.length) return null;

  const height = 340;
  const pad = { l: 64, r: 32, t: 44, b: 40 };
  const x = scaleLinear().domain([years[0].year, years[years.length - 1].year]).range([pad.l, width - pad.r]);
  const y = scaleLinear().domain([0, Math.max(...years.map((d) => Math.max(d.harmonized, d.raw ?? 0)))]).nice().range([height - pad.b, pad.t]);
  const path = (get: (d: YearTotal) => number) => years.map((d, i) => `${i ? "L" : "M"}${x(d.year).toFixed(1)},${y(get(d)).toFixed(1)}`).join("");
  const last = years[years.length - 1];

  const clean = seam.harmonized.lo <= 0 && seam.harmonized.hi >= 0;
  const finding = `As recorded, counts step ${ratio(seam.raw)} at ${monthLabel(seam.ym)}. Harmonized, the step is ${ratio(seam.harmonized)}: ${clean ? "its interval includes no step at all" : "a seam remains"}.`;

  const seamYear = ymParts(seam.ym).year;
  const nearSeam = Math.abs(ymParts(pettitt.harmonized.ym).year - seamYear) <= 1;
  const pettittLine = pettitt.harmonized.p >= 0.05
    ? `A change-point test finds no break anywhere in the harmonized series (${pValue(pettitt.harmonized.p)}).`
    : nearSeam && pettitt.aquaOnly.ym === pettitt.harmonized.ym
      ? `A change-point test still finds a break in the harmonized series at ${monthLabel(pettitt.harmonized.ym)}. Aqua alone, one instrument throughout, breaks at the same month, so that change is in the burning and not in the satellites.`
      : nearSeam
        ? `A change-point test finds a break in the harmonized series at ${monthLabel(pettitt.harmonized.ym)}, close to the handoff, and Aqua alone breaks elsewhere (${monthLabel(pettitt.aquaOnly.ym)}). We cannot rule out that some of the seam survives.`
        : `A change-point test puts the harmonized series' largest break at ${monthLabel(pettitt.harmonized.ym)}, away from the handoff. As recorded, the break sits at ${monthLabel(pettitt.raw.ym)}.`;

  return (
    <Figure n={1} id="seam" finding={finding}
      how="Each point is one full year. The thin line is what the satellite of the day counted; the heavy line is the same record translated to S-NPP's scale. They are the same line between the two dashed rules, where S-NPP itself was counting."
      mind="A harmonized step whose interval excluded ×1.00, or a change point at the handoff that Aqua alone does not share.">
      <div ref={wrap} className="plate">
        <svg {...plateProps(width, height, `Yearly fire-days as recorded and harmonized, ${years[0].year} to ${last.year}. The table below has the numbers.`)}>
          <rect width={width} height={height} fill={TOKENS.night} />
          <AxisLeft scale={y} ticks={y.ticks(5)} x={pad.l} format={count} />
          <AxisBottom scale={x} ticks={x.ticks(width < 600 ? 5 : 12)} y={height - pad.b} />
          {rules.map((r) => {
            const at = ymParts(r.ym);
            const rx = x(at.year + (at.month - 1) / 12 - 0.5);
            if (rx < pad.l || rx > width - pad.r + 1) return null;
            return (
              <g key={r.label}>
                <line x1={rx} x2={rx} y1={pad.t - 6} y2={height - pad.b} stroke={TOKENS.chalk} strokeOpacity={0.5} strokeDasharray="5 4" />
                <text x={Math.min(rx + 6, width - 8 - r.label.length * 6.8)} y={pad.t - 12} fontSize={13} fill={PLATE.ink}>{r.label}</text>
              </g>
            );
          })}
          <path d={path((d) => d.raw ?? 0)} fill="none" stroke={TOKENS.chalk} strokeOpacity={0.55} strokeWidth={1.5} />
          <path d={path((d) => d.harmonized)} fill="none" stroke={TOKENS.chalk} strokeWidth={3} />
          {years.map((d) => <circle key={d.year} cx={x(d.year)} cy={y(d.harmonized)} r={3} fill={TOKENS.chalk} />)}
          <text x={x(years[0].year) + 8} y={y(years[0].raw ?? 0) + 20} fontSize={13} fill={PLATE.soft}>as recorded</text>
          <text x={x(last.year)} y={y(last.harmonized) - 14} fontSize={13} fontWeight={600} textAnchor="end" fill={PLATE.ink}>harmonized</text>
        </svg>
      </div>
      <p className="figure-note">{pettittLine} The step intervals treat translated values as fixed.</p>
      <TableTwin caption="Yearly fire-days, as recorded and harmonized" columns={TABLE} rows={years} collapsible />
    </Figure>
  );
}
