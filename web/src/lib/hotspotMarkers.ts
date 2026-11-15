import type { Feature, Point } from "geojson";
import type { Map as MapLibreMap, ExpressionSpecification } from "maplibre-gl";
import { TOKENS } from "./color";

/** FRP drives visual emphasis, not a claim about fire severity. Missing FRP stays neutral. */
export function pointsFromCsv(csv: string): Feature<Point>[] {
  const [head, ...lines] = csv.trim().split(/\r?\n/);
  const cols = head.split(",").map((s) => s.trim());
  const lat = cols.indexOf("latitude"), lon = cols.indexOf("longitude"), frp = cols.indexOf("frp");
  if (lat < 0 || lon < 0) return [];
  return lines.flatMap((line, id) => {
    const row = line.split(",");
    if (row.length !== cols.length || !row[lat]?.trim() || !row[lon]?.trim()) return [];
    const latitude = Number(row[lat]), longitude = Number(row[lon]);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return [];
    const power = frp < 0 || !row[frp]?.trim() ? NaN : Number(row[frp]);
    const valid = Number.isFinite(power) && power >= 0;
    return [{
      type: "Feature" as const, id,
      properties: { frp: valid ? power : null, intensity: valid ? Math.min(1, Math.log1p(power) / Math.log1p(500)) : 0 },
      geometry: { type: "Point" as const, coordinates: [longitude, latitude] },
    }];
  });
}

export function addHotspotLayers(map: MapLibreMap): void {
  const intensity: ExpressionSpecification = ["coalesce", ["get", "intensity"], 0];
  const radius: ExpressionSpecification = ["interpolate", ["linear"], intensity, 0, 2.5, 1, 5];
  map.addLayer({ id: "hotspot-halo", type: "circle", source: "hotspots", paint: {
    "circle-color": TOKENS.chalk, "circle-radius": ["interpolate", ["linear"], intensity, 0, 6, 1, 14],
    "circle-blur": 0.85, "circle-opacity": 0.18,
  } });
  map.addLayer({ id: "hotspots", type: "circle", source: "hotspots", paint: {
    "circle-radius": radius, "circle-color": TOKENS.chalk, "circle-opacity": 0.85,
    "circle-stroke-color": TOKENS.chalk,
    "circle-stroke-width": ["case", ["boolean", ["feature-state", "selected"], false], 2, ["boolean", ["feature-state", "hover"], false], 1, 0],
    "circle-stroke-opacity": 0.65,
  } });
  let hovered: string | number | undefined, selected: string | number | undefined;
  map.on("mousemove", "hotspots", (event) => {
    if (hovered !== undefined) map.setFeatureState({ source: "hotspots", id: hovered }, { hover: false });
    hovered = event.features?.[0]?.id;
    if (hovered !== undefined) map.setFeatureState({ source: "hotspots", id: hovered }, { hover: true });
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", "hotspots", () => {
    if (hovered !== undefined) map.setFeatureState({ source: "hotspots", id: hovered }, { hover: false });
    hovered = undefined;
    map.getCanvas().style.cursor = "";
  });
  map.on("click", "hotspots", (event) => {
    if (selected !== undefined) map.setFeatureState({ source: "hotspots", id: selected }, { selected: false });
    selected = event.features?.[0]?.id;
    if (selected !== undefined) map.setFeatureState({ source: "hotspots", id: selected }, { selected: true });
  });
}

/** One shared halo update at 10 Hz; no per-marker DOM or React render loop. */
export function animateHotspots(map: MapLibreMap): () => void {
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let timer: number | undefined;
  const still = () => map.setPaintProperty("hotspot-halo", "circle-opacity", 0.18);
  const sync = () => {
    window.clearInterval(timer);
    timer = undefined;
    if (motion.matches || document.hidden) { still(); return; }
    timer = window.setInterval(() => {
      const wave = (1 + Math.sin(performance.now() / 650)) / 2;
      map.setPaintProperty("hotspot-halo", "circle-opacity",
        ["interpolate", ["linear"], ["coalesce", ["get", "intensity"], 0], 0, 0.14, 1, 0.18 + wave * 0.14]);
    }, 100);
  };
  sync();
  motion.addEventListener("change", sync);
  document.addEventListener("visibilitychange", sync);
  return () => {
    window.clearInterval(timer);
    motion.removeEventListener("change", sync);
    document.removeEventListener("visibilitychange", sync);
    // The map may already have been removed by the owning component.
  };
}

