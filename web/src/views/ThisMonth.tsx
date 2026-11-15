import { scaleLinear } from "d3-scale";
import { useMemo, useState } from "react";
import { useData } from "../data/context";
import { loadCurrent, loadForecast, loadMtd, loadSeason, useLoad } from "../data/load";
import { PLATE, TOKENS } from "../lib/color";
import { count, monthLabel, MONTHS, MONTHS_LONG, percent, utcStamp, ymParts } from "../lib/format";
import { useIsMobile, useWidth } from "../lib/hooks";
import { median } from "../lib/series";
import { Finding, Waiting } from "../parts/Finding";
import { Readout } from "../parts/Readout";
import { TableTwin, type Column } from "../parts/TableTwin";
import { useUrl } from "../state/url";
import type { Current, Forecast, Mtd, Season } from "../types";
import "./ThisMonth.css";

interface PastYear {
  year: number;
  toDate: number;
  full: number;
}

function quantile(sorted: number[], q: number): number {
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (i - lo);
}

const NRT_NAMES: Record<string, string> = { VIIRS_NOAA20_NRT: "NOAA-20", VIIRS_SNPP_NRT: "S-NPP", VIIRS_NOAA21_NRT: "NOAA-21" };

const TABLE: Column<PastYear>[] = [
  { key: "year", label: "Year", value: (r) => r.year },
  { key: "toDate", label: "Fire-days by this day", value: (r) => r.toDate, format: (r) => count(r.toDate) },
  { key: "full", label: "Fire-days by month's end", value: (r) => r.full, format: (r) => count(r.full) },
];

export default function ThisMonth() {
  const [url] = useUrl();
  const { region } = useData();
  const files = useLoad(`month:${region.id}`, async () => {
    const [current, mtd, season, forecast] = await Promise.all([loadCurrent(region.id), loadMtd(region.id), loadSeason(region.id), loadForecast(region.id)]);
    return { current, mtd, season, forecast };
  });
  if (files.state === "error") return <Waiting what="This month" error={files.message} />;
  if (files.state === "loading") return <Waiting what="This month" />;
  return <MonthBody {...files.data} boxed={url.box != null} />;
}

function MonthBody({ current, mtd, season, forecast, boxed }: { current: Current; mtd: Mtd; season: Season; forecast: Forecast; boxed: boolean }) {
  const { region } = useData();
  const compact = useIsMobile();
  const [wrap, width] = useWidth<HTMLDivElement>(compact ? 343 : 1200);
  const [active, setActive] = useState<number | null>(null);

  const past = useMemo<PastYear[]>(() => {
    const { year, month } = ymParts(current.ym);
    return Object.entries(mtd.byMonth[String(month)] ?? {})
      .filter(([y, days]) => Number(y) < year && days.length >= current.day)
      .map(([y, days]) => ({ year: Number(y), toDate: days[current.day - 1], full: days[days.length - 1] }));
  }, [current, mtd]);

  const { year, month } = ymParts(current.ym);
  const monthName = MONTHS_LONG[month - 1];
  const now = current.harmonizedToDate;
  const below = past.filter((p) => p.toDate > now).length;
  const above = past.filter((p) => p.toDate < now).length;
  const place = region.name.split(",")[0];
  const sentence = !past.length
    ? `So far this ${monthName}, ${place} has ${count(now)} fire-days. No past ${monthName} is on record to compare.`
    : below >= above
      ? `So far this ${monthName}, ${place} has burned less than in ${below} of ${past.length} past ${monthName}s.`
      : `So far this ${monthName}, ${place} has burned more than in ${above} of ${past.length} past ${monthName}s.`;
  const hovered = past.find((p) => p.year === active);

  return (
    <section className="month">
      <Finding title={`${monthName} in focus`} how={<>Each thin mark is one past {monthName}. The top row stops every year at day {current.day}, so it is a fair comparison with this year, in amber. The lower row shows where those months ended up. The thick bar spans the middle half of years and the tall mark is the median.</>}>
        {sentence}
      </Finding>

      <dl className="month-metrics">
        <div><dt>Observed fire-days</dt><dd>{count(current.fireDaysToDate)}</dd></div>
        <div><dt>Harmonized fire-days</dt><dd>{count(now)}</dd></div>
        <div>
          <dt>{current.cached ? "Stored observation" : "Latest observation"}</dt>
          <dd>
            <time dateTime={current.asOf}>{utcStamp(current.asOf)}</time>
            <span>Days 1–{current.day} · {NRT_NAMES[current.source] ?? current.source}</span>
          </dd>
        </div>
      </dl>
      {boxed && <p className="month-status">This view covers the whole region. A drawn box has no daily record.</p>}

      <div className="plot-surface">
        <h2 className="plot-label">Compare with past {monthName}s</h2>
        <div ref={wrap} className="month-plate">
          <Strips past={past} now={now} year={year} day={current.day} monthName={monthName} width={width} compact={compact} active={active} onActive={setActive} />
        </div>
      </div>
      <Readout hint={compact ? "Tap a mark to read that year." : "Point at a mark to read that year."}>
        {hovered ? `${monthName} ${hovered.year}: ${count(hovered.toDate)} fire-days by day ${current.day}, ${count(hovered.full)} by the end of the month.` : null}
      </Readout>
      <TableTwin caption={`Past ${monthName}s in ${region.name}`} columns={TABLE} rows={past} collapsible />

      <SeasonCurve season={season} year={year} month={month} width={width} compact={compact} />
      <NextMonth forecast={forecast} place={place} width={width} boxed={boxed} />
    </section>
  );
}

interface StripsProps {
  past: PastYear[];
  now: number;
  year: number;
  day: number;
  monthName: string;
  width: number;
  compact: boolean;
  active: number | null;
  onActive: (year: number | null) => void;
}

function Strips({ past, now, year, day, monthName, width, compact, active, onActive }: StripsProps) {
  const padL = compact ? 12 : 24;
  const padR = compact ? 16 : 48;
  const rowH = 116;
  const height = 2 * rowH + 56;
  const max = Math.max(now, 1, ...past.map((p) => p.full)) * 1.04;
  const x = (v: number) => padL + (v / max) * (width - padL - padR);
  const ticks = scaleLinear().domain([0, max]).ticks(compact ? 4 : 6);

  const row = (key: "toDate" | "full", top: number, title: string, soft: boolean) => {
    const sorted = past.map((p) => p[key]).sort((a, b) => a - b);
    const mid = sorted.length ? median(sorted) : null;
    const cy = top + 72;
    return (
      <g key={key}>
        <text x={padL} y={top + 20} fontSize={15} fontWeight={600} fill={PLATE.ink}>{title}</text>
        {sorted.length >= 4 && <rect x={x(quantile(sorted, 0.25))} y={cy - 4} width={x(quantile(sorted, 0.75)) - x(quantile(sorted, 0.25))} height={8} fill={TOKENS.chalk} opacity={soft ? 0.22 : 0.4} />}
        {past.map((p) => (
          <g key={p.year} onMouseEnter={() => onActive(p.year)} onClick={() => onActive(p.year)}>
            <rect x={x(p[key]) - 5} y={cy - 18} width={10} height={36} fill="transparent" />
            <line x1={x(p[key])} x2={x(p[key])} y1={cy - 14} y2={cy + 14} stroke={TOKENS.chalk} strokeWidth={active === p.year ? 3 : 1.5} opacity={active === p.year ? 1 : soft ? 0.45 : 0.8} />
          </g>
        ))}
        {mid != null && (
          <>
            <line x1={x(mid)} x2={x(mid)} y1={cy - 22} y2={cy + 22} stroke={TOKENS.chalk} strokeWidth={2.5} />
            <text x={x(mid)} y={cy + 38} fontSize={13} fill={PLATE.soft} textAnchor={x(mid) > width - 120 ? "end" : "start"}>median {count(Math.round(mid))}</text>
          </>
        )}
        {!soft && (
          <>
            <line x1={x(now)} x2={x(now)} y1={cy - 24} y2={cy + 24} stroke={TOKENS.sodium} strokeWidth={3} />
            <text x={x(now) + 8} y={cy - 26} fontSize={15} fontWeight={600} fill={TOKENS.sodium}>{year}: {count(Math.round(now))}</text>
          </>
        )}
      </g>
    );
  };

  return (
    <svg width={width} height={height} role="img" fontFamily={PLATE.font} style={{ display: "block", fontVariantNumeric: "tabular-nums" }}
      aria-label={`Past ${monthName}s compared with ${year}. The table below holds the same numbers.`} onMouseLeave={() => onActive(null)}>
      <rect width={width} height={height} fill={TOKENS.night} />
      {row("toDate", 8, `Days 1–${day} of each ${monthName}`, false)}
      {row("full", 8 + rowH, `The whole of each past ${monthName}`, true)}
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={height - 34} y2={height - 28} stroke={PLATE.rule} />
          <text x={x(t)} y={height - 12} fontSize={13} fill={PLATE.soft} textAnchor={t === 0 ? "start" : "middle"}>{count(t)}{t === 0 && !compact ? " fire-days" : ""}</text>
        </g>
      ))}
    </svg>
  );
}

function SeasonCurve({ season, year, month, width, compact }: { season: Season; year: number; month: number; width: number; compact: boolean }) {
  const start = season.fireYearStartMonth;
  const fireYear = month >= start ? year : year - 1;
  const curve = season.years[String(fireYear)] ?? [];
  if (!curve.length) return null;

  const max = Math.max(curve[curve.length - 1], ...season.envelope.p90) * 1.05;
  // Room for the longest axis label, at about 8 px per tabular digit.
  const padL = Math.max(compact ? 44 : 64, 22 + 8 * count(Math.max(...scaleLinear().domain([0, max]).ticks(5))).length);
  const padR = compact ? 12 : 152;
  const height = compact ? 260 : 340;
  const top = 20;
  const bottom = height - 36;
  const x = (d: number) => padL + (d / 364) * (width - padL - padR);
  const y = (v: number) => bottom - (v / max) * (bottom - top);
  const line = (v: number[]) => v.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p).toFixed(1)}`).join("");
  const band = (lo: number[], hi: number[]) => `${line(hi)}${[...lo].map((p, i) => `L${x(i).toFixed(1)},${y(p).toFixed(1)}`).reverse().join("")}Z`;

  const dayNow = curve.length;
  const total = curve[dayNow - 1];
  const p50 = season.envelope.p50[Math.min(dayNow, 365) - 1];
  const rank = (["p10", "p25", "p50", "p75", "p90"] as const).filter((k) => total > season.envelope[k][Math.min(dayNow, 365) - 1]).length;
  const where = ["below the lowest tenth of years", "in the lower quarter of years", "below the median year", "above the median year", "in the upper quarter of years", "above the highest tenth of years"][rank];
  const monthStarts = Array.from({ length: 12 }, (_, i) => {
    const m = (start - 1 + i) % 12;
    const d = (Date.UTC(2001 + (m < start - 1 ? 1 : 0), m, 1) - Date.UTC(2001, start - 1, 1)) / 86_400_000;
    return { d, label: MONTHS[m] };
  });
  const yTicks = scaleLinear().domain([0, max]).ticks(5);

  return (
    <div className="month-season">
      <Finding level="h2" how={<>The yellow line adds up this fire year's fire-days from {MONTHS_LONG[start - 1]} onward. The pale band holds the middle 80% of the {season.completeYears} complete past years at each date and the brighter band the middle half.</>}>
        {`Since ${MONTHS_LONG[start - 1]}, ${count(Math.round(total))} fire-days: ${where} for this date (median ${count(Math.round(p50))}).`}
      </Finding>
      <svg width={width} height={height} role="img" fontFamily={PLATE.font} style={{ display: "block", fontVariantNumeric: "tabular-nums" }}
        aria-label={`Fire-days added up since ${MONTHS_LONG[start - 1]} ${fireYear}: ${count(Math.round(total))}, against a median of ${count(Math.round(p50))} by this date.`}>
        <rect width={width} height={height} fill={TOKENS.night} />
        <path d={band(season.envelope.p10, season.envelope.p90)} fill={TOKENS.chalk} opacity={0.14} />
        <path d={band(season.envelope.p25, season.envelope.p75)} fill={TOKENS.chalk} opacity={0.2} />
        <path d={line(season.envelope.p50)} fill="none" stroke={TOKENS.chalk} strokeWidth={1.5} opacity={0.8} />
        <path d={line(curve.slice(0, 365))} fill="none" stroke={TOKENS.sodium} strokeWidth={3} />
        <circle cx={x(Math.min(dayNow, 365) - 1)} cy={y(total)} r={4.5} fill={TOKENS.sodium} />
        <text x={x(Math.min(dayNow, 365) - 1) + 10} y={y(total) + 5} fontSize={15} fontWeight={600} fill={TOKENS.sodium}>{fireYear}</text>
        {!compact && (
          <>
            <text x={x(364) + 8} y={y(season.envelope.p50[364]) + 4} fontSize={13} fill={PLATE.ink}>median year</text>
            <text x={x(364) + 8} y={y(season.envelope.p90[364]) + 4} fontSize={13} fill={PLATE.soft}>9 in 10 years below</text>
            <text x={x(364) + 8} y={y(season.envelope.p10[364]) + 4} fontSize={13} fill={PLATE.soft}>1 in 10 below</text>
          </>
        )}
        {monthStarts.map(({ d, label }) => (
          <g key={label}>
            <line x1={x(d)} x2={x(d)} y1={bottom} y2={bottom + 6} stroke={PLATE.rule} />
            <text x={x(d) + 3} y={bottom + 22} fontSize={13} fill={PLATE.soft}>{compact ? label[0] : label}</text>
          </g>
        ))}
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={padL - 6} x2={padL} y1={y(t)} y2={y(t)} stroke={PLATE.rule} />
            <text x={padL - 10} y={y(t) + 4} fontSize={13} fill={PLATE.soft} textAnchor="end">{count(t)}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/** The forecast for the month after this one, drawn only where it beat the seasonal normal in testing. */
function NextMonth({ forecast, place, width, boxed }: { forecast: Forecast; place: string; width: number; boxed: boolean }) {
  const { skill, next } = forecast;
  if (!next) return null;
  const name = MONTHS_LONG[ymParts(next.ym).month - 1];
  const tested = `Tested on ${skill.backtest.replace("..", " to ")} by forecasting each month from what was known ${forecast.horizonMonths} months before`;
  if (!forecast.shown) {
    return (
      <p className="month-forecast-none fine">
        No forecast for {name} is shown for {place}. {tested}, it missed by {percent(skill.model)} in a typical month, and the
        normal {name} alone missed by {percent(skill.climatology)}, so it adds nothing.
      </p>
    );
  }

  const height = 96;
  const pad = 24;
  const max = Math.max(next.hi, next.normal) * 1.1;
  const x = scaleLinear().domain([0, max]).range([pad, width - pad]);
  const ticks = x.ticks(width < 500 ? 4 : 8);
  return (
    <div className="month-forecast">
      <Finding level="h2" how={<>{tested.replace("forecasting", "forecasting, with a quantile gradient-boosted model,")}: it missed by {percent(skill.model)} in a typical month, against {percent(skill.climatology)} for the normal {name} and {percent(skill.persistence)} for carrying the latest anomaly forward. {skill.intervalScale > 1 ? `Its 90% range held the true value in ${percent(skill.coverage90Raw)} of months, so ranges are widened ×${skill.intervalScale.toFixed(2)}.` : `Its 90% range held the true value in ${percent(skill.coverage90)} of months.`} Made from the record up to {monthLabel(next.from)}.</>}>
        {`${name} forecast: ${count(Math.round(next.value))} fire-days (${count(Math.round(next.lo))} to ${count(Math.round(next.hi))}), against a normal ${name} of ${count(Math.round(next.normal))}.`}
      </Finding>
      <svg width={width} height={height} role="img" fontFamily={PLATE.font} style={{ display: "block", fontVariantNumeric: "tabular-nums" }}
        aria-label={`Forecast for ${name}: ${count(Math.round(next.value))} fire-days, 90% range ${count(Math.round(next.lo))} to ${count(Math.round(next.hi))}. Normal ${name}: ${count(Math.round(next.normal))}.`}>
        <rect width={width} height={height} fill={TOKENS.night} />
        <rect x={x(next.lo)} y={30} width={x(next.hi) - x(next.lo)} height={12} fill={TOKENS.chalk} opacity={0.3} />
        <circle cx={x(next.value)} cy={36} r={6} fill={TOKENS.chalk} />
        <line x1={x(next.normal)} x2={x(next.normal)} y1={20} y2={52} stroke={TOKENS.chalk} strokeWidth={1} strokeDasharray="3 3" />
        <text x={x(next.normal)} y={14} fontSize={13} textAnchor="middle" fill={PLATE.soft}>normal</text>
        {ticks.map((t) => (
          <text key={t} x={x(t)} y={78} fontSize={13} textAnchor="middle" fill={PLATE.soft}>{count(t)}</text>
        ))}
      </svg>
      {boxed && <p className="fine">The forecast is for the whole region, not the drawn box.</p>}
      <p className="fine">A statistical forecast from past months only. It knows nothing about weather or fires burning now; follow local fire authorities.</p>
    </div>
  );
}
