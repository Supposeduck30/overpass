import { useEffect } from "react";
import { useData } from "../data/context";
import { AtlasFigure } from "./evidence/AtlasFigure";
import { DialFigure } from "./evidence/DialFigure";
import { Ladder } from "./evidence/Ladder";
import { Seam } from "./evidence/Seam";
import { Splits } from "./evidence/Splits";
import { Units } from "./evidence/Units";
import "./Evidence.css";

/** Six figures that test the method, failures included, then the pipeline's own list of what it could not settle. */
export default function Evidence() {
  const { validation, region } = useData();

  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);

  return (
    <div>
      <Seam />
      <Splits />
      <Ladder />
      <Units />
      <DialFigure />
      <AtlasFigure />
      <section className="unverified" aria-label="What we could not verify">
        <h2>What we could not verify in {region.name}</h2>
        <ul>
          {validation.notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
      </section>
    </div>
  );
}
