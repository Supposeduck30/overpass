import { useEffect, useMemo, useState } from "react";
import { useData } from "../data/context";
import { seamSteps } from "../data/guards";
import { count, times } from "../lib/format";
import { useUrl, type UrlState } from "../state/url";
import "./Tour.css";

const STEP_MS = 6000;

interface Step {
  caption: string;
  enter: Partial<UrlState>;
  /** applied halfway through the step */
  midway?: Partial<UrlState>;
}

/** A one-minute walk through the five things worth seeing. It only writes URL state, so stopping leaves a normal page. */
export default function Tour() {
  const [, setUrl] = useUrl();
  const { region, monthly, validation } = useData();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const steps = useMemo<Step[]>(() => {
    const seam = seamSteps(validation)[0];
    const place = region.name.split(",")[0];
    const drift = validation.driftEffect.aquaLatestShiftMinutes;
    const base = { box: null, table: false, panel: null, unit: "fd" } as const;
    return [
      {
        caption: seam
          ? `In ${place}, raw fire counts jump ${times(Math.exp(seam.raw.step))} in ${seam.ym.slice(0, 4)}. A new satellite arrived; the fires did not change. Harmonized, every year is on one scale.`
          : `${place}'s fire record, first as each satellite counted it, then harmonized onto one scale.`,
        enter: { ...base, v: "calendar", mode: "r", color: "counts" },
        midway: { mode: "h" },
      },
      {
        caption: `The same record as terrain: ${monthly.months.length} months, with the cliff at the satellite change melting as the counts are translated.`,
        enter: { ...base, v: "scenes", scene: "cliff", mode: "r" },
        midway: { mode: "h" },
      },
      {
        caption: drift != null
          ? `Each satellite passes at its own local time. Aqua now passes ${count(Math.round(Math.abs(drift)))} minutes ${drift > 0 ? "later" : "earlier"} than it used to.`
          : "Each satellite passes at its own local time, and those times drift.",
        enter: { ...base, v: "evidence", mode: "h" },
      },
      {
        caption: `Where the burning happens, month by month. Each column is one grid cell; its height is that month's fire-days.`,
        enter: { ...base, v: "scenes", scene: "flyover", mode: "h" },
      },
      {
        caption: `And now: this month so far, set against every earlier year on the same scale.`,
        enter: { ...base, v: "month", mode: "h" },
      },
    ];
  }, [region, monthly, validation]);

  const step = steps[index];

  useEffect(() => {
    setUrl(step.enter, "replace");
    if (step.enter.v === "evidence") requestAnimationFrame(() => document.getElementById("dial")?.scrollIntoView({ block: "center" }));
    else window.scrollTo({ top: 0 });
  }, [step, setUrl]);

  useEffect(() => {
    if (paused) return;
    const mid = step.midway ? window.setTimeout(() => setUrl(step.midway!, "replace"), STEP_MS / 2) : 0;
    const next = window.setTimeout(() => {
      if (index + 1 < steps.length) setIndex(index + 1);
      else setUrl({ tour: false }, "replace");
    }, STEP_MS);
    return () => {
      window.clearTimeout(mid);
      window.clearTimeout(next);
    };
  }, [index, paused, step, steps.length, setUrl]);

  return (
    <aside className="tour" aria-label="Tour">
      <p className="tour-caption" aria-live="polite">
        <span className="tour-count">{index + 1} of {steps.length}</span> {step.caption}
      </p>
      <div className="tour-controls">
        <button type="button" className="btn" onClick={() => setPaused(!paused)}>{paused ? "Resume" : "Pause"}</button>
        <button type="button" className="btn" disabled={index + 1 >= steps.length} onClick={() => setIndex(index + 1)}>Skip</button>
        <button type="button" className="btn" onClick={() => setUrl({ tour: false }, "replace")}>Stop</button>
      </div>
    </aside>
  );
}
