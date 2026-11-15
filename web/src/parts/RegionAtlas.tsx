import { useState } from "react";
import { useData } from "../data/context";
import { useUrl } from "../state/url";
import type { Region } from "../types";
import land from "../assets/atlas-land.svg";
import orbit from "../assets/orbit.jpg";

// Compact schematic projection for region selection; the analytical map is unchanged.
// The bundled Natural Earth land asset uses the same transform.
const project = (lon: number, lat: number) => [360 + lon * 1.9 * Math.cos(lat * Math.PI / 400), (84 - lat) * 1.3];
const center = (r: Region) => [(r.bbox[0] + r.bbox[2]) / 2, (r.bbox[1] + r.bbox[3]) / 2];
const line = (points: number[][]) => points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
const graticule = [
  ...[-60, -30, 0, 30, 60].map(lat => line(Array.from({ length: 73 }, (_, i) => project(-180 + i * 5, lat)))),
  ...[-150, -100, -50, 0, 50, 100, 150].map(lon => line(Array.from({ length: 30 }, (_, i) => project(lon, -60 + i * 5)))),
].join(" ");
const coordinate = (n: number, positive: string, negative: string) => `${Math.abs(n).toFixed(1)}°${n < 0 ? negative : positive}`;

export function RegionAtlas() {
  const { regions, region, span } = useData();
  const [, setUrl] = useUrl();
  const [hovered, setHovered] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const shown = regions.find(r => r.id === hovered) ?? region;
  const [lon, lat] = center(shown);
  const [x, y] = project(lon, lat);
  const mapLabel = shown.name.split(",")[0];
  const labelWidth = mapLabel.length * 6.5 + 16;
  const labelX = x < 480 ? x + 34 : x - 34 - labelWidth;
  const index = regions.findIndex(r => r.id === region.id);
  const choose = (r: Region) => {
    setHovered(null);
    if (r.id !== region.id) setUrl({ r: r.id, box: null, from: null, to: null, ym: null });
  };
  const bounds = shown.bbox;
  const boundary = line([
    project(bounds[0], bounds[1]), project(bounds[0], bounds[3]),
    project(bounds[2], bounds[3]), project(bounds[2], bounds[1]),
  ]) + "Z";

  return (
    <section className={`region-atlas${expanded ? " atlas-expanded" : ""}`} aria-label="Explore the satellite fire atlas">
      <img className="atlas-art" src={orbit} width={1536} height={1024} alt="" fetchPriority="high" decoding="async" />
      <div className="atlas-intro">
        <h1>Satellite<br /> fire atlas</h1>
        <p className="atlas-description">Compare decades of fire observations from four satellites on a common scale.</p>
        <div className="atlas-hero-actions">
          <button type="button" className="atlas-jump" onClick={() => {
            const record = document.getElementById("fire-record") ?? document.getElementById("view");
            record?.focus({ preventScroll: true });
            record?.scrollIntoView({ block: "start" });
          }}>Explore the record <span aria-hidden="true">↓</span></button>
          <button type="button" className="atlas-expand" aria-expanded={expanded} aria-controls="atlas-geography" onClick={() => setExpanded(!expanded)}>{expanded ? "Close atlas" : "Explore atlas"}<span aria-hidden="true">{expanded ? "−" : "+"}</span></button>
        </div>
      </div>
      <div className="atlas-geography" id="atlas-geography">
        <div className="atlas-map-head">
          <strong>Choose a region</strong>
          <span>{regions.length} regions · {span[0].slice(0, 4)}–{span[1].slice(0, 4)}</span>
        </div>
        <svg className="atlas-world" viewBox="0 0 720 210" aria-label="Choose a prepared region on the world map">
          <path d={graticule} className="atlas-graticule" />
          <image href={land} width="720" height="210" />
          <path d={boundary} className="atlas-boundary" />
          <path d={`M${x},${y}H${x < 480 ? x + 34 : x - 34}`} className="atlas-leader" />
          {regions.map(r => {
            const [cx, cy] = project(...center(r) as [number, number]);
            return <g key={r.id} role="button" tabIndex={0} aria-label={`Explore ${r.name}`} aria-pressed={r.id === region.id}
              className={`atlas-marker${r.id === shown.id ? " is-shown" : ""}`}
              onMouseEnter={() => setHovered(r.id)} onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(r.id)} onBlur={() => setHovered(null)}
              onClick={() => choose(r)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(r); } }}>
              <circle cx={cx} cy={cy} r="20" className="atlas-hit" />
              <circle cx={cx} cy={cy} r="11" className="atlas-halo" />
              <circle cx={cx} cy={cy} r="4.5" className="atlas-dot" />
              <title>{r.name}</title>
            </g>;
          })}
          <g className="atlas-map-label" transform={`translate(${labelX},${y - 12})`}>
            <rect width={labelWidth} height="24" rx="2" />
            <text x="8" y="16">{mapLabel}</text>
          </g>
        </svg>
        <div className="atlas-location">
          <div><span className="atlas-location-label">{hovered && hovered !== region.id ? "Explore region" : "Selected region"}</span><strong>{shown.name}</strong></div>
          <span className="atlas-coordinates">{coordinate(lat, "N", "S")} / {coordinate(lon, "E", "W")}</span>
          <div className="atlas-stepper">
            <button type="button" aria-label="Previous region" onClick={() => choose(regions[(index - 1 + regions.length) % regions.length])}>←</button>
            <button type="button" aria-label="Next region" onClick={() => choose(regions[(index + 1) % regions.length])}>→</button>
          </div>
        </div>
      </div>
    </section>
  );
}
