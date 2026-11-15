import { scaleLinear, scaleSqrt } from "d3-scale";
import type { FeatureCollection, Position } from "geojson";
import { useMemo } from "react";
import { useData } from "../../data/context";
import { loadAtlas, useLoad } from "../../data/load";
import { PLATE, sequential, TOKENS } from "../../lib/color";
import { percent } from "../../lib/format";
import { useWidth } from "../../lib/hooks";
import { Waiting } from "../../parts/Finding";
import { TableTwin, type Column } from "../../parts/TableTwin";
import type { AtlasEntry, Region } from "../../types";
import { AxisBottom, Figure, plateProps } from "./Figure";
import { MODEL_NAMES } from "./Ladder";

type Row = AtlasEntry & { name: string; lon: number; lat: number };

const LAT: [number, number] = [-58, 78];

async function loadLand(): Promise<FeatureCollection> {
  const res = await fetch("/geo/land.json");
  if (!res.ok) throw new Error(`The world outline could not be loaded (HTTP ${res.status}). Reload to try again.`);
  return res.json();
}

function ring(points: Position[], px: (lon: number) => number, py: (lat: number) => number): string {
  return points.map(([lon, lat], i) => `${i ? "L" : "M"}${px(lon).toFixed(1)},${py(Math.max(LAT[0], Math.min(LAT[1], lat))).toFixed(1)}`).join("") + "Z";
}

function landPath(land: FeatureCollection, px: (lon: number) => number, py: (lat: number) => number): string {
  let d = "";
  for (const f of land.features) {
    const g = f.geometry;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    for (const poly of polys) for (const r of poly) d += ring(r, px, py);
  }
  return d;
}

const TABLE: Column<Row>[] = [
  { key: "name", label: "Region", value: (r) => r.name },
  { key: "rate", label: "S-NPP per Aqua fire-day", value: (r) => r.exchangeRate, format: (r) => `×${r.exchangeRate.toFixed(2)}` },
  { key: "lo", label: "Low", value: (r) => r.lo, format: (r) => `×${r.lo.toFixed(2)}` },
  { key: "hi", label: "High", value: (r) => r.hi, format: (r) => `×${r.hi.toFixed(2)}` },
  { key: "at", label: "At an Aqua month of", value: (r) => r.atSourceCount },
  { key: "ours", label: "Our median error", value: (r) => r.medApeOurs, format: (r) => percent(r.medApeOurs, 1) },
  { key: "global", label: "Global-factor error", value: (r) => r.medApeGlobalFactor, format: (r) => percent(r.medApeGlobalFactor, 1) },
  { key: "model", label: "Model in use", value: (r) => MODEL_NAMES[r.model] ?? r.model },
  { key: "cov", label: "90% interval covers", value: (r) => r.coverage90, format: (r) => percent(r.coverage90) },
  { key: "n20", label: "S-NPP per NOAA-20 fire-day", value: (r) => r.link2Factor, format: (r) => `×${r.link2Factor.toFixed(3)}` },
];

function rows(atlas: AtlasEntry[], regions: Region[]): Row[] {
  return atlas.flatMap((a) => {
    const r = regions.find((x) => x.id === a.id);
    return r ? [{ ...a, name: r.name, lon: (r.bbox[0] + r.bbox[2]) / 2, lat: (r.bbox[1] + r.bbox[3]) / 2 }] : [];
  }).sort((a, b) => b.exchangeRate - a.exchangeRate);
}

function WorldMap({ data, land, width, current }: { data: Row[]; land: FeatureCollection; width: number; current: string }) {
  const height = Math.round((width * (LAT[1] - LAT[0])) / 360);
  const px = useMemo(() => scaleLinear().domain([-180, 180]).range([0, width]), [width]);
  const py = useMemo(() => scaleLinear().domain(LAT).range([height, 0]), [height]);
  const d = useMemo(() => landPath(land, px, py), [land, px, py]);
  const max = Math.max(...data.map((r) => r.exchangeRate));
  const size = scaleSqrt().domain([0, max]).range([0, width < 600 ? 11 : 18]);
  return (
    <svg {...plateProps(width, height, "World map with one mark per prepared region, sized by its exchange rate. The table below has the numbers.")}>
      <rect width={width} height={height} fill={TOKENS.night} />
      <path d={d} fill="#16325A" />
      {data.map((r) => {
        const cx = px(r.lon);
        const cy = py(r.lat);
        const rad = size(r.exchangeRate);
        const left = cx > width * 0.8;
        return (
          <g key={r.id}>
            <circle cx={cx} cy={cy} r={rad} fill={sequential(r.exchangeRate / max)} stroke={TOKENS.chalk} strokeWidth={r.id === current ? 2.5 : 1} />
            <text x={left ? cx - rad - 6 : cx + rad + 6} y={cy + 4} fontSize={13} fontWeight={r.id === current ? 700 : 400} textAnchor={left ? "end" : "start"} fill={PLATE.ink}
              stroke={TOKENS.night} strokeWidth={4} paintOrder="stroke">×{r.exchangeRate.toFixed(1)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function Rows({ data, width, current }: { data: Row[]; width: number; current: string }) {
  const narrow = width < 720;
  const rowH = narrow ? 76 : 36;
  const pad = { l: narrow ? 16 : 220, r: 24, t: 44, b: 40 };
  const gap = 56;
  const half = narrow ? width - pad.l - pad.r : (width - pad.l - pad.r - gap) / 2;
  const height = pad.t + data.length * rowH + pad.b;
  const xr = scaleLinear().domain([1, Math.max(...data.map((r) => r.hi))]).nice().range([pad.l, pad.l + half]);
  const e0 = narrow ? pad.l : pad.l + half + gap;
  const xe = scaleLinear().domain([0, Math.max(...data.map((r) => Math.max(r.medApeOurs, r.medApeGlobalFactor)))]).nice().range([e0, e0 + half]);
  return (
    <svg {...plateProps(width, height, "For each region: the exchange rate with its interval, and the held-out error of our model against one global factor. The table below has the numbers.")}>
      <rect width={width} height={height} fill={TOKENS.night} />
      {!narrow && <text x={pad.l} y={24} fontSize={15} fontWeight={600} fill={PLATE.ink}>S-NPP fire-days per Aqua fire-day</text>}
      <text x={e0} y={24} fontSize={15} fontWeight={600} fill={PLATE.ink}>{narrow ? "Rate with interval; error, ours filled" : "Median error: ours filled, one global factor hollow"}</text>
      {!narrow && <AxisBottom scale={xr} ticks={xr.ticks(4)} y={height - pad.b} format={(t) => `×${t}`} />}
      <AxisBottom scale={xe} ticks={xe.ticks(4)} y={height - pad.b} format={(t) => percent(t)} />
      {data.map((r, i) => {
        const top = pad.t + i * rowH;
        const cy = narrow ? top + 52 : top + rowH / 2;
        const on = r.id === current;
        const xrN = narrow ? scaleLinear().domain(xr.domain()).range([pad.l, pad.l + half]) : xr;
        const ry = narrow ? top + 30 : cy;
        return (
          <g key={r.id}>
            <text x={narrow ? 16 : pad.l - 16} y={narrow ? top + 12 : cy + 4} fontSize={13} textAnchor={narrow ? "start" : "end"} fontWeight={on ? 700 : 400} fill={on ? PLATE.ink : PLATE.soft}>
              {r.name}{narrow ? `, ×${r.exchangeRate.toFixed(2)} (${r.lo.toFixed(2)} to ${r.hi.toFixed(2)})` : ""}
            </text>
            <line x1={xrN(r.lo)} x2={xrN(r.hi)} y1={ry} y2={ry} stroke={TOKENS.chalk} strokeWidth={2} />
            <circle cx={xrN(r.exchangeRate)} cy={ry} r={5} fill={sequential(r.exchangeRate / xr.domain()[1])} stroke={TOKENS.chalk} strokeWidth={1.5} />
            {!narrow && <text x={xrN(r.hi) + 10} y={ry + 4} fontSize={13} fill={PLATE.ink}>×{r.exchangeRate.toFixed(2)}</text>}
            <line x1={xe(r.medApeOurs)} x2={xe(r.medApeGlobalFactor)} y1={cy} y2={cy} stroke={TOKENS.chalk} strokeOpacity={0.5} />
            <circle cx={xe(r.medApeGlobalFactor)} cy={cy} r={5} fill={TOKENS.night} stroke={TOKENS.chalk} strokeWidth={1.5} />
            <circle cx={xe(r.medApeOurs)} cy={cy} r={5} fill={TOKENS.chalk} />
          </g>
        );
      })}
    </svg>
  );
}

export function AtlasFigure() {
  const { regions, region } = useData();
  const [wrap, width] = useWidth<HTMLDivElement>(1000);
  const atlas = useLoad("atlas", loadAtlas);
  const land = useLoad("land", loadLand);
  if (atlas.state !== "ready") return <Waiting what="The exchange-rate atlas" error={atlas.state === "error" ? atlas.message : undefined} />;

  const data = rows(atlas.data, regions);
  if (!data.length) return null;
  const hi = data[0];
  const lo = data[data.length - 1];
  const better = data.filter((r) => r.medApeOurs < r.medApeGlobalFactor).length;
  const places = data.length === 1 ? "the 1 region prepared so far" : `${data.length} regions`;
  const range = data.length === 1
    ? `One Aqua fire-day stands for ${hi.exchangeRate.toFixed(1)} S-NPP fire-days in ${hi.name}, ${places}.`
    : `One Aqua fire-day stands for ${lo.exchangeRate.toFixed(1)} S-NPP fire-days in ${lo.name} and ${hi.exchangeRate.toFixed(1)} in ${hi.name}.`;
  const finding = `${range} A regional model beats one global factor in ${better} of ${data.length === 1 ? "1 region" : places}.`;

  return (
    <Figure n={6} id="atlas" finding={finding}
      how="Each mark on the map is a prepared region; a larger, brighter mark means S-NPP counts more fire-days for each one Aqua counts there. Below, the bar is the interval on that rate, and the two dots compare errors on held-out years: filled for the model Overpass uses in that region, hollow for a single factor shared by every region."
      mind="Rates that agreed across regions within their intervals, or a global factor that predicted as well as the regional models, would mean one published number is enough and regional calibration adds nothing.">
      <div ref={wrap} className="plate figure-stack">
        {land.state === "ready"
          ? <WorldMap data={data} land={land.data} width={width} current={region.id} />
          : <div style={{ height: Math.round((width * (LAT[1] - LAT[0])) / 360) }} />}
        <Rows data={data} width={width} current={region.id} />
      </div>
      <p className="figure-note">
        Each rate is read at that region's typical Aqua month, so it is a summary of a curve, not a constant.
        {data.length < 6 ? ` Only ${places} ${data.length === 1 ? "is" : "are"} prepared so far; ${data.length} ${data.length === 1 ? "point does" : "points do"} not make a global pattern.` : ""}
      </p>
      <TableTwin caption="Exchange rate and held-out error by region" columns={TABLE} rows={data} collapsible />
    </Figure>
  );
}
