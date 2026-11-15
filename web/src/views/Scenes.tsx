import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useData } from "../data/context";
import { seamSteps } from "../data/guards";
import { loadCells, useLoad } from "../data/load";
import { count, monthLabel, times } from "../lib/format";
import { useIsMobile, useTween, useWidth } from "../lib/hooks";
import { cellValues } from "../lib/series";
import { Finding, Waiting } from "../parts/Finding";
import { Readout } from "../parts/Readout";
import { FlatCells } from "../scenes/FlatCells";
import { buildFlyover, describeColumn, place, type Column } from "../scenes/flyover";
import { MiniCalendar } from "../scenes/MiniCalendar";
import { contourStep } from "../scenes/terrain";
import { useUrl } from "../state/url";
import type { Cells } from "../types";
import { CalendarPlate } from "./CalendarPlate";
import { describe, handoffs, normalsAt, recordFinding } from "./calendarModel";
import "./Scenes.css";

const PLAY_MS = 320;
const CliffMelt = lazy(() => import("../scenes/CliffMelt").then((m) => ({ default: m.CliffMelt })));
const ColumnFlyover = lazy(() => import("../scenes/ColumnFlyover").then((m) => ({ default: m.ColumnFlyover })));

function SceneLoading() {
  return <p className="scenes-loading small" role="status">Loading the 3D scene…</p>;
}

/** Whether the 3D scene is on screen. Phones start on the flat twin; a browser without WebGL stays on it. */
function useDepth(): { show3d: boolean; failed: boolean; toggle: () => void; fail: () => void; compact: boolean } {
  const [url, setUrl] = useUrl();
  const compact = useIsMobile();
  const [asked, setAsked] = useState(false);
  const [failed, setFailed] = useState(false);
  return {
    show3d: !failed && (compact ? asked : url.d3),
    failed,
    compact,
    toggle: () => (compact ? setAsked(!asked) : setUrl({ d3: !url.d3 })),
    fail: () => setFailed(true),
  };
}

function plateHeight(width: number, compact: boolean): number {
  return compact ? 420 : Math.round(Math.min(680, Math.max(480, width * 0.5)));
}

function SceneSwitch() {
  const [url, setUrl] = useUrl();
  return (
    <div className="scene-picker" role="group" aria-label="Scene">
      <button type="button" className="btn" aria-pressed={url.scene === "cliff"} onClick={() => setUrl({ scene: "cliff" })}>
        Cliff melt
      </button>
      <button type="button" className="btn" aria-pressed={url.scene === "flyover"} onClick={() => setUrl({ scene: "flyover" })}>
        Column flyover
      </button>
    </div>
  );
}

function DepthButton({ depth }: { depth: ReturnType<typeof useDepth> }) {
  return (
    <button type="button" className="btn" disabled={depth.failed} onClick={depth.toggle}>
      {depth.show3d ? "View flat" : "View in 3D"}
    </button>
  );
}

function Cliff() {
  const [url, setUrl] = useUrl();
  const { region, monthly, validation } = useData();
  const depth = useDepth();
  const [wrap, width] = useWidth<HTMLDivElement>(depth.compact ? 343 : 1200);
  const [active, setActive] = useState<string | null>(null);

  const record = useMemo(() => cellValues(monthly, "fd"), [monthly]);
  const rules = useMemo(() => handoffs(record), [record]);
  const normals = useMemo(() => normalsAt(record, url.mode === "h" ? 1 : 0), [record, url.mode]);
  const k = useTween(url.mode === "h" ? 1 : 0, 900);

  const first = record[0];
  const last = record[record.length - 1];
  const activeMonth = record.find((m) => m.ym === active);
  const step = contourStep(Math.max(1, ...record.map((m) => Math.max(m.raw ?? 0, m.harmonized))));
  const height = plateHeight(width, depth.compact);
  const label = `Monthly fire-days for ${region.name}, ${first.year} to ${last.year}. Arrow keys move between months; the line below reads each one out.`;

  return (
    <section className="scenes">
      <Finding level="h2" title="The record as terrain" how={depth.show3d
        ? <>The record as land. Months run left to right and years from the back, {first.year}, to the front, {last.year}; height is that month's fire-days. Raw records show a wall where a more sensitive satellite took over. Harmonized lifts the older years onto the newer satellite's scale, and the wall goes.</>
        : <>Each row is a year and each column a month. Brighter means more fire-days. Dashed lines mark the months when the satellite behind the record changed; hatched months are translated from an older satellite.</>}>
        {recordFinding(record, url.mode, false, false, validation)}
      </Finding>

      <div className="scenes-controls">
        <div className="seg" role="group" aria-label="Record">
          <button type="button" className="btn" aria-pressed={url.mode === "r"} onClick={() => setUrl({ mode: "r" })}>Raw records</button>
          <button type="button" className="btn" aria-pressed={url.mode === "h"} onClick={() => setUrl({ mode: "h" })}>Harmonized</button>
        </div>
        <DepthButton depth={depth} />
      </div>
      <p className="scenes-why fine">{depth.failed ? "This browser could not start 3D drawing, so the flat version is shown." : depth.show3d ? "Drag to turn the terrain." : ""}</p>

      <div ref={wrap} className="plate scenes-plate" style={{ minHeight: height }}>
        {depth.show3d ? (
          <Suspense fallback={<SceneLoading />}>
            <CliffMelt months={record} k={k} ramp={url.ramp} handoffs={rules} active={active} onActive={setActive}
              width={width} height={height} label={label} onFail={depth.fail} />
          </Suspense>
        ) : (
          <CalendarPlate months={record} record={record} k={k} color="counts" ramp={url.ramp} handoffs={rules}
            criticalMonths={region.criticalMonths} active={active} onActive={setActive} width={width} compact={depth.compact} label={label} />
        )}
      </div>

      <Readout hint={depth.compact ? "Tap a month to read it out." : "Point at a month, or focus the plate and use the arrow keys, to read it out here."}>
        {activeMonth ? describe(activeMonth, { mode: url.mode, unit: "fd", boxed: false, normal: normals[activeMonth.month - 1], latest: activeMonth.ym === last.ym }) : null}
      </Readout>
      {depth.show3d && (
        <p className="scenes-caption small">
          Contour lines are {count(step)} fire-days apart. The yellow line follows {last.year}, the year in progress.
          {rules.length ? " With Harmonized on, the pale sheets above and below the translated years are the 90% interval on the translation." : ""}
        </p>
      )}
    </section>
  );
}

function Flyover({ cells }: { cells: Cells }) {
  const [url, setUrl] = useUrl();
  const { region, monthly, validation } = useData();
  const depth = useDepth();
  const [wrap, width] = useWidth<HTMLDivElement>(depth.compact ? 343 : 1200);
  const [hover, setHover] = useState<Column | null>(null);
  const [cell, setCell] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  const fly = useMemo(() => buildFlyover(cells), [cells]);
  const rules = useMemo(() => handoffs(cellValues(monthly, "fd")), [monthly]);
  const found = url.ym ? cells.months.indexOf(url.ym) : -1;
  const mi = found >= 0 ? found : fly.busiest;
  const ym = cells.months[mi];
  const columns = fly.byMonth[mi];
  const lastIndex = cells.months.length - 1;

  useEffect(() => {
    if (!playing) return;
    if (mi >= lastIndex) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => setUrl({ ym: cells.months[mi + 1] }, "replace"), PLAY_MS);
    return () => window.clearTimeout(timer);
  }, [playing, mi, lastIndex, cells.months, setUrl]);

  const top = useMemo(() => [...columns].sort((a, b) => b.value - a.value).slice(0, 10), [columns]);
  const busiest = top[0];
  const finding = busiest
    ? `In ${monthLabel(ym, true)}, ${count(columns.length)} of ${count(cells.cells.length)} cells burned. The busiest took ${busiest.value.toFixed(1)} of the month's ${count(Math.round(fly.totals[mi]))} fire-days.`
    : `No cell burned in ${monthLabel(ym, true)}.`;

  const left = seamSteps(validation).filter((s) => s.harmonized.lo > 0 || s.harmonized.hi < 0);
  const changes = rules.map((r) => monthLabel(r.ym, true)).join(" and ");
  const seamNote = !rules.length
    ? ""
    : left.length
      ? `A step of ${times(Math.exp(left[0].harmonized.step), 2)} remains at the ${left[0].ym.slice(0, 4)} satellite change after harmonizing, so compare heights across that date with care.`
      : `Heights are harmonized fire-days, so the months when the satellite changed (${changes}) bring no jump in column heights.`;

  const height = plateHeight(width, depth.compact);
  const label = `Map of ${region.name} with one mark for each 0.25° grid cell that burned in ${monthLabel(ym, true)}. The list of busiest cells below opens any of them.`;
  const play = () => {
    if (!playing && mi >= lastIndex) setUrl({ ym: cells.months[0] }, "replace");
    setPlaying(!playing);
  };

  return (
    <section className="scenes">
      <Finding level="h2" title="Fire activity by location" how={<>Each {depth.show3d ? "column" : "square"} is one grid cell of about 25 km, drawn where it is. {depth.show3d ? "Taller and brighter" : "Brighter"} means more fire-days in the chosen month. Move the month, or press Play to run through the record. Choose a cell to see its own calendar.</>}>
        {finding}
      </Finding>

      <div className="scenes-controls">
        <div className="scenes-scrub">
          <label className="label" htmlFor="flyover-month">Month</label>
          <input id="flyover-month" type="range" min={0} max={lastIndex} step={1} value={mi}
            aria-valuetext={monthLabel(ym, true)} onChange={(e) => setUrl({ ym: cells.months[Number(e.target.value)] }, "replace")} />
          <output htmlFor="flyover-month">{monthLabel(ym)}</output>
        </div>
        <button type="button" className="btn scenes-play" onClick={play}>{playing ? "Pause" : "Play"}</button>
        <label>
          <span className="sr-only">Open a cell</span>
          <select className="field" value={cell != null && top.some((c) => c.ci === cell) ? cell : ""} disabled={!top.length}
            onChange={(e) => setCell(e.target.value === "" ? null : Number(e.target.value))}>
            <option value="">{top.length ? "Open one of the busiest cells" : "No cells burned this month"}</option>
            {top.map((c) => (
              <option key={c.ci} value={c.ci}>{place(c.lat, c.lon)}: {c.value.toFixed(1)} fire-days</option>
            ))}
          </select>
        </label>
        <DepthButton depth={depth} />
      </div>
      <p className="scenes-why fine">{depth.failed ? "This browser could not start 3D drawing, so the flat version is shown." : depth.show3d ? "Drag to move the map; hold Ctrl and drag to turn it." : ""}</p>

      <div ref={wrap} className="plate scenes-plate" style={{ minHeight: depth.show3d ? height : undefined }}>
        {depth.show3d ? (
          <Suspense fallback={<SceneLoading />}>
            <ColumnFlyover columns={columns} grid={cells.grid} max={fly.max} bbox={region.bbox} ramp={url.ramp} selected={cell}
              onHover={setHover} onPick={setCell} width={width} height={height} label={label} onFail={depth.fail} />
          </Suspense>
        ) : (
          <FlatCells cells={cells} columns={columns} max={fly.max} bbox={region.bbox} ramp={url.ramp} selected={cell}
            onHover={setHover} onPick={setCell} width={width} label={label} />
        )}
      </div>

      <Readout hint={depth.compact ? "Tap a cell to open its calendar." : "Point at a cell to read it out here. Click it to open its calendar."}>
        {hover ? describeColumn(hover, ym) : null}
      </Readout>
      <p className="scenes-caption small">{seamNote} {depth.show3d ? `The tallest column in the whole record is ${fly.max.toFixed(1)} fire-days; every month uses the same height and color scale.` : "Every month uses the same color scale."}</p>

      {cell != null && <MiniCalendar cells={cells} ci={cell} ramp={url.ramp} handoffs={rules} ym={ym} onClose={() => setCell(null)} />}
    </section>
  );
}

function FlyoverLoader() {
  const { region } = useData();
  const cells = useLoad(`cells:${region.id}`, () => loadCells(region.id));
  if (cells.state !== "ready" || !cells.data) return <Waiting what="Column flyover" error={cells.state === "error" ? cells.message : undefined} />;
  return <Flyover key={region.id} cells={cells.data} />;
}

export default function Scenes() {
  const [url] = useUrl();
  return (
    <div className="scenes-view">
      <header className="view-title"><h1>Scenes</h1></header>
      <SceneSwitch />
      {url.scene === "flyover" ? <FlyoverLoader /> : <Cliff />}
    </div>
  );
}
