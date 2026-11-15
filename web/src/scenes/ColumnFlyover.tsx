import { ColumnLayer } from "@deck.gl/layers";
import { MapboxOverlay } from "@deck.gl/mapbox";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { hexToRgb, sequential, TOKENS, type RampName } from "../lib/color";
import { prefersReducedMotion } from "../lib/hooks";
import { PLATE_STYLE } from "../lib/mapStyle";
import type { Box } from "../types";
import type { Column } from "./flyover";

const SETTLE_MS = 2500;
const PITCH = 50;
const BEARING = -14;
/** Height in metres of the tallest column the record holds. */
const TALLEST = 140_000;
/** The settle plays once per visit, not each time the scene is reopened. */
let settled = false;

type Rgb = [number, number, number];

function rgb(color: string): Rgb {
  return color.startsWith("#") ? hexToRgb(color) : (color.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number) as Rgb);
}

interface Props {
  columns: Column[];
  /** cell size in degrees */
  grid: number;
  max: number;
  bbox: Box;
  ramp: RampName;
  selected: number | null;
  onHover: (c: Column | null) => void;
  onPick: (ci: number) => void;
  width: number;
  height: number;
  label: string;
  /** called when the browser cannot start WebGL */
  onFail: () => void;
}

export function ColumnFlyover({ columns, grid, max, bbox, ramp, selected, onHover, onPick, width, height, label, onFail }: Props) {
  const holder = useRef<HTMLDivElement>(null);
  const overlay = useRef<MapboxOverlay | null>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const live = useRef({ onHover, onPick, onFail });
  live.current = { onHover, onPick, onFail };

  useEffect(() => {
    let m: maplibregl.Map;
    try {
      m = new maplibregl.Map({ container: holder.current!, style: PLATE_STYLE, attributionControl: false, scrollZoom: false, maxPitch: 70, maxZoom: 9 });
    } catch {
      live.current.onFail();
      return;
    }
    const fit = m.cameraForBounds(bbox, { padding: 24 });
    // The fit is for a flat map; pitched, the region sits further back and can come closer.
    const rest = { ...fit, zoom: (fit?.zoom ?? 5) + 0.45, pitch: PITCH, bearing: BEARING };
    if (settled || prefersReducedMotion()) m.jumpTo(rest);
    else {
      m.jumpTo({ ...rest, pitch: 0, bearing: 0 });
      m.once("load", () => m.easeTo({ ...rest, duration: SETTLE_MS }));
    }
    settled = true;
    const o = new MapboxOverlay({ interleaved: false, layers: [] });
    m.addControl(o as unknown as maplibregl.IControl);
    map.current = m;
    overlay.current = o;
    return () => {
      m.removeControl(o as unknown as maplibregl.IControl);
      o.finalize();
      m.remove();
      map.current = null;
      overlay.current = null;
    };
  }, [bbox]);

  useEffect(() => {
    map.current?.resize();
  }, [width, height]);

  useEffect(() => {
    const midLat = (bbox[1] + bbox[3]) / 2;
    // Half the cell's east-west width in metres, taken out to the corner of the square.
    const radius = (grid / 2) * 111_320 * Math.cos((midLat * Math.PI) / 180) * Math.SQRT2 * 0.92;
    overlay.current?.setProps({
      layers: [
        new ColumnLayer<Column>({
          id: "columns", data: columns, diskResolution: 4, angle: 45, radius, extruded: true, pickable: true,
          getPosition: (c) => [c.lon, c.lat],
          getElevation: (c) => c.value,
          elevationScale: TALLEST / max,
          getFillColor: (c) => (c.ci === selected ? rgb(TOKENS.chalk) : rgb(sequential(Math.sqrt(c.value / max), ramp))),
          material: { ambient: 0.8, diffuse: 0.45, shininess: 0, specularColor: [0, 0, 0] },
          updateTriggers: { getFillColor: [selected, ramp, max] },
          onHover: (info) => live.current.onHover(info.object ?? null),
          onClick: (info) => {
            if (info.object) live.current.onPick(info.object.ci);
          },
        }),
      ],
    });
  }, [columns, grid, max, bbox, ramp, selected]);

  return <div ref={holder} className="flyover" style={{ width, height }} role="application" aria-label={label} onMouseLeave={() => onHover(null)} />;
}
