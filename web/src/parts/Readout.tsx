import type { ReactNode } from "react";
import "./Readout.css";

/** The fixed line under a plate where the hovered or focused mark is read out. Keeps its height when empty. */
export function Readout({ children, hint }: { children: ReactNode; hint: string }) {
  return (
    <p className={children == null ? "readout" : "readout telemetry"} aria-live="polite">
      {children ?? <span className="readout-hint">{hint}</span>}
    </p>
  );
}
