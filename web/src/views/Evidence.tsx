import { useEffect } from "react";
import { useData } from "../data/context";
import { AtlasFigure } from "./evidence/AtlasFigure";
import { DialFigure } from "./evidence/DialFigure";
import { ForecastFigure } from "./evidence/ForecastFigure";
import { Ladder } from "./evidence/Ladder";
import { Seam } from "./evidence/Seam";
import { Splits } from "./evidence/Splits";
import { Units } from "./evidence/Units";
import "./Evidence.css";

const SECTIONS = [
  ["seam", "Satellite handoffs"],
  ["backward", "Backward tests"],
  ["ladder", "Calibration"],
  ["units", "Fire-days and detections"],
  ["dial", "Overpass times"],
  ["atlas", "Regional checks"],
  ["forecast", "Forecast accuracy"],
  ["unverified", "Open questions"],
];

/** Seven figures that test the method, failures included, then the pipeline's own list of what it could not settle. */
export default function Evidence() {
  const { validation, region } = useData();

  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);

  return (
    <div className="evidence-view">
      <header className="view-title">
        <h1>Does harmonization hold up?</h1>
        <p>Seven checks on the fire record for {region.name}, including where the method falls short.</p>
      </header>
      <div className="evidence-grid">
        <nav className="evidence-index" aria-label="Evidence sections">
          <strong>Jump to a check</strong>
          {SECTIONS.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
        </nav>
        <div className="evidence-figures">
          <Seam />
          <Splits />
          <Ladder />
          <Units />
          <DialFigure />
          <AtlasFigure />
          <ForecastFigure />
          <section className="unverified" id="unverified" aria-label="What we could not verify">
            <h2>What we could not verify in {region.name}</h2>
            <ul>
              {validation.notes.map((n) => <li key={n}>{n}</li>)}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
