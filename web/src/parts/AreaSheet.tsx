import type { Feature, Point } from "geojson";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useData } from "../data/context";
import { useSelection } from "../data/selection";
import { TOKENS } from "../lib/color";
import { count, saveFile } from "../lib/format";
import { boxInside } from "../lib/grid";
import { boxPolygon, collection, PLATE_STYLE } from "../lib/mapStyle";
import { parseBox, useUrl } from "../state/url";
import type { Box } from "../types";
import { DownloadList } from "./Downloads";
import "./AreaSheet.css";

/** Largest box, in square degrees, the live hotspot request accepts. Matches api/firms.ts. */
const LIVE_MAX_AREA = 400;

type Live = { state: "idle" } | { state: "loading" } | { state: "error"; message: string } | { state: "ready"; csv: string; rows: number };

function roundBox(b: Box): Box {
  return b.map((v) => Math.round(v * 100) / 100) as Box;
}

function pointsFromCsv(csv: string): Feature<Point>[] {
  const [head, ...lines] = csv.trim().split("\n");
  const cols = head.split(",");
  const lat = cols.indexOf("latitude");
  const lon = cols.indexOf("longitude");
  return lines.map((l) => l.split(",")).filter((c) => c.length === cols.length)
    .map((c) => ({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [Number(c[lon]), Number(c[lat])] } }));
}

export default function AreaSheet() {
  const [url, setUrl] = useUrl();
  const { regions, region } = useData();
  const sel = useSelection();
  const holder = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  /** a box outside every prepared region; kept out of the URL because no view can show it */
  const [outside, setOutside] = useState<Box | null>(null);
  const [typed, setTyped] = useState(url.box ? url.box.join(", ") : "");
  const [typedError, setTypedError] = useState("");
  const [live, setLive] = useState<Live>({ state: "idle" });

  const shown = url.box ?? outside;

  useEffect(() => {
    const m = new maplibregl.Map({ container: holder.current!, style: PLATE_STYLE, attributionControl: false, dragRotate: false, pitchWithRotate: false, maxZoom: 9 });
    m.fitBounds(region.bbox, { padding: 60, animate: false });
    m.on("load", () => {
      m.addSource("regions", { type: "geojson", data: collection(regions.map((r) => boxPolygon(r.bbox, { id: r.id }))) });
      m.addSource("box", { type: "geojson", data: collection([]) });
      m.addSource("hotspots", { type: "geojson", data: collection([]) });
      m.addLayer({ id: "regions", type: "line", source: "regions", paint: { "line-color": TOKENS.chalk, "line-width": 1.5 } });
      m.addLayer({ id: "hotspots", type: "circle", source: "hotspots", paint: { "circle-radius": 2.5, "circle-color": TOKENS.chalk, "circle-opacity": 0.85 } });
      m.addLayer({ id: "box", type: "line", source: "box", paint: { "line-color": TOKENS.sodium, "line-width": 2 } });
      setReady(true);
    });
    map.current = m;
    return () => m.remove();
    // The map is built once; later region changes are handled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready) return;
    (map.current!.getSource("box") as maplibregl.GeoJSONSource).setData(collection(shown ? [boxPolygon(shown)] : []));
  }, [ready, shown]);

  useEffect(() => {
    if (!ready) return;
    (map.current!.getSource("hotspots") as maplibregl.GeoJSONSource).setData(collection(live.state === "ready" ? pointsFromCsv(live.csv) : []));
  }, [ready, live]);

  const choose = (box: Box) => {
    const b = roundBox(box);
    const home = regions.find((r) => boxInside(b, r.bbox));
    setLive({ state: "idle" });
    setTyped(b.join(", "));
    setTypedError("");
    if (home) {
      setOutside(null);
      setUrl({ r: home.id, box: b });
    } else {
      setOutside(b);
      if (url.box) setUrl({ box: null });
    }
  };

  const clear = () => {
    setOutside(null);
    setTyped("");
    setLive({ state: "idle" });
    setUrl({ box: null });
  };

  const at = (e: PointerEvent) => {
    const r = holder.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const endDrag = () => {
    if (!drag) return;
    const a = map.current!.unproject([Math.min(drag.x0, drag.x1), Math.max(drag.y0, drag.y1)]);
    const b = map.current!.unproject([Math.max(drag.x0, drag.x1), Math.min(drag.y0, drag.y1)]);
    setDrag(null);
    setDrawing(false);
    if (Math.abs(drag.x1 - drag.x0) > 6 && Math.abs(drag.y1 - drag.y0) > 6) choose([a.lng, a.lat, b.lng, b.lat]);
  };

  const loadLive = async (box: Box) => {
    setLive({ state: "loading" });
    try {
      const res = await fetch(`/api/firms?box=${box.join(",")}&days=31`);
      const text = await res.text();
      if (!res.ok) throw new Error(text.slice(0, 200) || `HTTP ${res.status}`);
      setLive({ state: "ready", csv: text, rows: Math.max(0, text.trim().split("\n").length - 1) });
    } catch (err) {
      setLive({ state: "error", message: err instanceof Error ? err.message : String(err) });
    }
  };

  const area = outside ? (outside[2] - outside[0]) * (outside[3] - outside[1]) : 0;

  return (
    <div className="area">
      <div className="area-map plate">
        <div ref={holder} className="area-canvas" role="img" aria-label="Map of prepared regions and your box. Use the fields beside it to set a box without a pointer." />
        {drawing && (
          <div className="area-draw"
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); const p = at(e); setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y }); }}
            onPointerMove={(e) => { if (drag) { const p = at(e); setDrag({ ...drag, x1: p.x, y1: p.y }); } }}
            onPointerUp={endDrag}>
            {drag && <div className="area-rubber" style={{ left: Math.min(drag.x0, drag.x1), top: Math.min(drag.y0, drag.y1), width: Math.abs(drag.x1 - drag.x0), height: Math.abs(drag.y1 - drag.y0) }} />}
          </div>
        )}
        <p className="area-credit">Outlines: Natural Earth</p>
      </div>

      <div className="area-side">
        <div className="area-row">
          <button type="button" className="btn" aria-pressed={drawing} onClick={() => setDrawing(!drawing)}>
            {drawing ? "Drag on the map" : "Draw a box"}
          </button>
          <button type="button" className="btn" disabled={!shown} onClick={clear}>Clear box</button>
        </div>

        <form className="area-typed" onSubmit={(e) => {
          e.preventDefault();
          const b = parseBox(typed.replace(/\s+/g, ""));
          if (b) choose(b);
          else setTypedError("Enter four numbers: west, south, east, north. West must be less than east and south less than north.");
        }}>
          <label>
            <span className="label">Or type west, south, east, north in degrees</span>
            <input className="field" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="-65, -32.5, -63.5, -30.5" inputMode="text" />
          </label>
          <button type="submit" className="btn">Use these bounds</button>
          <p className="fine" role="alert">{typedError}</p>
        </form>

        <div className="area-result" aria-live="polite">
          {url.box && (
            <>
              <p>
                <strong>Your box is inside {region.name}.</strong>{" "}
                {sel.loading ? "Adding up its cells." : `${count(sel.cellCount)} grid cells in it have burning on record. Every view now shows the box.`}
              </p>
              <button type="button" className="btn" onClick={() => setUrl({ panel: null, v: "calendar" })}>Show its calendar</button>
              <DownloadList />
            </>
          )}
          {outside && (
            <>
              <p><strong>Overpass has no calibrated history here yet.</strong> It can show the last 31 days of NOAA-20 detections for this box, uncalibrated, on the map and as a CSV.</p>
              <button type="button" className="btn" disabled={live.state === "loading" || area > LIVE_MAX_AREA} onClick={() => loadLive(outside)}>
                {live.state === "loading" ? "Asking FIRMS" : "Load the last 31 days"}
              </button>
              {area > LIVE_MAX_AREA && <p className="fine">This box covers {count(Math.round(area))} square degrees. Live requests stop at {LIVE_MAX_AREA}; draw a smaller box.</p>}
              {live.state === "error" && <p role="alert">The live request failed: {live.message} Check that the site has a FIRMS key, then try again.</p>}
              {live.state === "ready" && (
                <>
                  <p>{count(live.rows)} detections in the last 31 days.</p>
                  <button type="button" className="btn" disabled={!live.rows} onClick={() => saveFile(`overpass_box_${outside.join("_")}_noaa20_31d.csv`, live.csv)}>
                    Download these hotspots as CSV
                  </button>
                </>
              )}
            </>
          )}
          {!shown && <p className="fine">Draw a box inside an outlined region to get its own calendar and files. A box anywhere else gets recent detections only.</p>}
        </div>

        <h3 className="area-heading">Prepared regions</h3>
        <ul className="area-presets">
          {regions.map((r) => (
            <li key={r.id}>
              <button type="button" className="btn" aria-pressed={r.id === region.id && !url.box}
                onClick={() => { setOutside(null); setTyped(""); setUrl({ r: r.id, box: null, from: null, to: null }); map.current?.fitBounds(r.bbox, { padding: 60 }); }}>
                {r.name}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
