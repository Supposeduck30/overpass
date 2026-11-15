import { setWorkerUrl, type StyleSpecification } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import type { Feature, FeatureCollection, Geometry, Polygon } from "geojson";
import type { Box } from "../types";
import { TOKENS } from "./color";

// MapLibre ships its worker as a separate module; the bundler has to be told where it ends up.
setWorkerUrl(workerUrl);

/** A night plate drawn from local Natural Earth outlines. No tiles, labels or outside requests. */
export const PLATE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    land: { type: "geojson", data: "/geo/land.json" },
    countries: { type: "geojson", data: "/geo/countries.json" },
    admin1: { type: "geojson", data: "/geo/admin1.json" },
  },
  layers: [
    { id: "sea", type: "background", paint: { "background-color": TOKENS.night } },
    { id: "land", type: "fill", source: "land", paint: { "fill-color": TOKENS.plateLift } },
    { id: "admin1", type: "line", source: "admin1", minzoom: 3, paint: { "line-color": TOKENS.chalk, "line-opacity": 0.4, "line-width": 0.8 } },
    { id: "countries", type: "line", source: "countries", paint: { "line-color": TOKENS.chalk, "line-opacity": 0.7, "line-width": 1.2 } },
  ],
};

export function boxPolygon([w, s, e, n]: Box, properties: Record<string, string | number> = {}): Feature<Polygon> {
  return { type: "Feature", properties, geometry: { type: "Polygon", coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] } };
}

export function collection<G extends Geometry>(features: Feature<G>[]): FeatureCollection<G> {
  return { type: "FeatureCollection", features };
}
