import { useEffect, useRef, useState } from "react";
import { useData } from "../data/context";
import { inRange, useSelection } from "../data/selection";
import { boxSlug, hotspotsCsv, monthlyCsv, saveSvgAsPng } from "../lib/downloads";
import { count, saveFile } from "../lib/format";
import { useUrl } from "../state/url";
import { PLATE_ID } from "../views/CalendarPlate";
import "./Downloads.css";

/** The four downloads, for whatever region, box and year range is on screen. */
export function DownloadList({ onDone }: { onDone?: () => void }) {
  const [url] = useUrl();
  const { region, validation, from, to } = useData();
  const sel = useSelection();
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const stem = `overpass_${region.id}${boxSlug(url.box)}_${from}_${to}`;
  const calendarShown = url.v === "calendar" && !url.table;

  const run = async (work: () => Promise<string>) => {
    setBusy(true);
    try {
      setStatus(await work());
      onDone?.();
    } catch (err) {
      setStatus(`The download failed: ${err instanceof Error ? err.message : String(err)} Try again, or narrow the year range.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="downloads-list">
      <button type="button" className="btn" disabled={busy || sel.loading}
        onClick={() => run(async () => {
          const months = inRange(sel.months, from, to);
          saveFile(`${stem}_monthly.csv`, monthlyCsv(months, sel.boxed));
          return `Saved ${months.length} months.`;
        })}>
        Download monthly CSV
      </button>
      <button type="button" className="btn" disabled={busy || !region.hotspots}
        onClick={() => run(async () => {
          const { csv, rows } = await hotspotsCsv(region.id, from, to, url.box, (year) => setStatus(`Reading detections for ${year}`));
          saveFile(`${stem}_hotspots.csv`, csv);
          return `Saved ${count(rows)} detections.`;
        })}>
        Download hotspots CSV
      </button>
      <button type="button" className="btn" disabled={busy || !calendarShown}
        onClick={() => run(async () => {
          const svg = document.getElementById(PLATE_ID);
          if (!(svg instanceof SVGSVGElement)) throw new Error("The calendar is not on screen.");
          await saveSvgAsPng(svg, `${stem}_calendar.png`);
          return "Saved the calendar image.";
        })}>
        Download calendar PNG
      </button>
      <button type="button" className="btn" disabled={busy}
        onClick={() => run(async () => {
          saveFile(`overpass_${region.id}_validation.json`, JSON.stringify(validation, null, 1), "application/json");
          return "Saved the validation file.";
        })}>
        Download validation JSON
      </button>
      <p className="fine" role="status">
        {status
          || (!region.hotspots ? "Hotspot files for this region were left out to keep the site small. "
            : "")
          + (!calendarShown ? "The PNG is available when the calendar is on screen. " : "")
          + `Files cover ${url.box ? "your box" : region.name}, ${from} to ${to}.`}
      </p>
    </div>
  );
}

export function Downloads() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", away);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", away);
    };
  }, [open]);

  return (
    <div className="downloads" ref={ref}>
      <button type="button" className="btn" aria-expanded={open} onClick={() => setOpen(!open)}>Download</button>
      {open && (
        <div className="downloads-menu">
          <DownloadList />
        </div>
      )}
    </div>
  );
}
