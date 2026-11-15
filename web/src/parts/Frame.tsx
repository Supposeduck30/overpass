import { lazy, Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useData } from "../data/context";
import { toYm, ymParts } from "../lib/format";
import { useStoredFlag } from "../lib/hooks";
import { useUrl, VIEW_NAMES, VIEWS } from "../state/url";
import { dialGlyphSvg } from "./Dial";
import { Downloads } from "./Downloads";
import { Drawer } from "./Drawer";
import { Methods } from "./Methods";
import { RangeSlider } from "./RangeSlider";
import "./Frame.css";

const AreaSheet = lazy(() => import("./AreaSheet"));
const Tour = lazy(() => import("../scenes/Tour"));

const KEYS: [string, string][] = [
  ["1 to 5", "Calendar, This month, Season, Evidence, Scenes"],
  ["/", "Choose a region"],
  ["a", "Open Area"],
  ["t", "Show or hide the table"],
  ["h", "Switch between raw records and harmonized"],
  ["Arrow keys", "Move between months on the calendar"],
  ["?", "Show these shortcuts"],
  ["Esc", "Close a drawer, a sheet or the tour"],
];

export function Frame({ children }: { children: ReactNode }) {
  const [url, setUrl] = useUrl();
  const { regions, region, validation, span, from, to } = useData();
  const regionSelect = useRef<HTMLSelectElement>(null);
  const [hintSeen, dismissHint] = useStoredFlag("overpass.hint");

  const glyph = useMemo(() => dialGlyphSvg(validation.drift.at(-1)), [validation]);

  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (link) link.href = `data:image/svg+xml,${encodeURIComponent(glyph)}`;
  }, [glyph]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (url.tour) setUrl({ tour: false });
        else if (url.panel) setUrl({ panel: null });
        return;
      }
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return;
      if (e.key >= "1" && e.key <= "5") setUrl({ v: VIEWS[Number(e.key) - 1], panel: null });
      else if (e.key === "/") {
        e.preventDefault();
        regionSelect.current?.focus();
      } else if (e.key === "a") setUrl({ panel: "area" });
      else if (e.key === "t") setUrl({ table: !url.table });
      else if (e.key === "h" && !url.box && url.unit === "fd") setUrl({ mode: url.mode === "h" ? "r" : "h" });
      else if (e.key === "?") setUrl({ panel: "keys" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [url, setUrl]);

  const y0 = ymParts(span[0]).year;
  const y1 = ymParts(span[1]).year;
  const close = () => setUrl({ panel: null });
  const showHint = !hintSeen && url.v === "calendar" && url.mode === "r" && !url.tour;

  return (
    <div className="frame">
      <a className="sr-only" href="#view">Skip to the view</a>
      <header className="frame-head">
        <a className="wordmark" href={`?r=${region.id}`} aria-label="Overpass, back to the calendar">
          <span className="wordmark-glyph" aria-hidden="true" dangerouslySetInnerHTML={{ __html: glyph }} />
          Overpass
        </a>
        <label className="frame-region">
          <span className="sr-only">Region</span>
          <select ref={regionSelect} className="field" value={region.id}
            onChange={(e) => setUrl({ r: e.target.value, box: null, from: null, to: null, ym: null })}>
            {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <div className="frame-range">
          <RangeSlider min={y0} max={y1} from={ymParts(from).year} to={ymParts(to).year}
            onChange={(a, b) => setUrl({ from: a === y0 ? null : toYm(a, 1), to: b === y1 ? null : toYm(b, 12) }, "replace")} />
        </div>
        <div className="frame-actions">
          <button type="button" className="btn" aria-pressed={url.panel === "area"} onClick={() => setUrl({ panel: "area" })}>
            {url.box ? "Area: your box" : "Area"}
          </button>
          <Downloads />
        </div>
      </header>

      <nav className="frame-nav" aria-label="Views">
        <ul className="frame-views">
          {VIEWS.map((v) => (
            <li key={v}>
              <button type="button" className="btn" aria-current={url.v === v ? "true" : undefined} onClick={() => setUrl({ v })}>
                {VIEW_NAMES[v]}
              </button>
            </li>
          ))}
        </ul>
        <div className="frame-side">
          <button type="button" className="btn" aria-pressed={url.tour} onClick={() => setUrl({ tour: !url.tour, panel: null })}>
            {url.tour ? "Stop tour" : "Play tour"}
          </button>
          <button type="button" className="btn" aria-pressed={url.panel === "methods"} onClick={() => setUrl({ panel: "methods" })}>
            Methods
          </button>
        </div>
      </nav>

      <div className="frame-hint">
        {showHint && (
          <p>
            Rows above 2012 come from an older, coarser satellite. Try <strong>Harmonized</strong> to put every year on one scale.{" "}
            <button type="button" className="btn btn-quiet" onClick={dismissHint}>Dismiss</button>
          </p>
        )}
      </div>

      <main id="view" className="frame-main" tabIndex={-1}>
        {children}
      </main>

      <footer className="frame-foot fine">
        <p>
          Fire detections from NASA FIRMS (MODIS Collection 6.1 and VIIRS 375 m). Outlines from Natural Earth.
          Overpass is a student project and is not a NASA product. It does not replace local fire authorities.
        </p>
      </footer>

      <nav className="frame-bottom" aria-label="Views">
        {VIEWS.map((v) => (
          <button key={v} type="button" aria-current={url.v === v ? "true" : undefined} onClick={() => setUrl({ v })}>
            {VIEW_NAMES[v]}
          </button>
        ))}
      </nav>

      {url.panel === "methods" && <Drawer title="Methods" onClose={close}><Methods /></Drawer>}
      {url.panel === "keys" && (
        <Drawer title="Keyboard shortcuts" onClose={close}>
          <dl className="frame-keys">
            {KEYS.map(([key, what]) => (
              <div key={key}><dt>{key}</dt><dd>{what}</dd></div>
            ))}
          </dl>
        </Drawer>
      )}
      {url.panel === "area" && (
        <Drawer title="Area" kind="sheet" onClose={close}>
          <Suspense fallback={<p className="fine">Loading the map</p>}><AreaSheet /></Suspense>
        </Drawer>
      )}
      {url.tour && <Suspense fallback={null}><Tour /></Suspense>}
    </div>
  );
}
