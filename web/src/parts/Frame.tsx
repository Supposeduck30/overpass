import { lazy, Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useData } from "../data/context";
import { toYm, ymParts } from "../lib/format";
import { useUrl, VIEW_NAMES, VIEWS } from "../state/url";
import { dialGlyphSvg } from "./Dial";
import { Downloads } from "./Downloads";
import { useAskEnabled } from "../lib/useAskEnabled";
import { Drawer } from "./Drawer";
import { RangeSlider } from "./RangeSlider";
import { RegionAtlas } from "./RegionAtlas";
import "./Frame.css";

const Ask = lazy(() => import("./Ask").then((m) => ({ default: m.Ask })));
const Methods = lazy(() => import("./Methods").then((m) => ({ default: m.Methods })));
const AreaSheet = lazy(() => import("./AreaSheet"));
const Tour = lazy(() => import("../scenes/Tour"));

const ICON_PATHS = {
  calendar: "M4 4h16v16H4z M4 9h16 M9 9v11 M15 9v11 M4 14h16",
  month: "M12 3a9 9 0 1 0 9 9 M12 3v9h9 M16 3v5h5",
  season: "M3 18c4 0 3-12 7-12s3 12 7 12 4-6 4-6 M3 21h18",
  evidence: "M5 3h14v18H5z M8 8h8 M8 12h8 M8 16h4",
  scenes: "m12 3 9 5v9l-9 5-9-5V8z M3 8l9 5 9-5 M12 13v9",
};
function ViewIcon({ view }: { view: typeof VIEWS[number] }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICON_PATHS[view]} /></svg>;
}

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
  const home = useRef<HTMLDivElement>(null);

  function navigate(view: typeof VIEWS[number]) {
    if (view === url.v) return;
    setUrl({ v: view, panel: null });
    home.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }

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
  const askOn = useAskEnabled();

  return (
    <div className="frame frame-observatory">
      <div ref={home} className="frame-start" />
      <a className="sr-only" href="#view">Skip to the view</a>
      <header className="frame-head">
        <a className="wordmark" href={`?r=${region.id}`} aria-label="Overpass, back to the calendar">
          <span className="wordmark-glyph" aria-hidden="true" dangerouslySetInnerHTML={{ __html: glyph }} />
          Overpass
        </a>
        <nav className="frame-nav" aria-label="Views">
          <ul className="frame-views">
            {VIEWS.map((v) => (
              <li key={v}>
                <button type="button" className="btn" aria-current={url.v === v ? "page" : undefined} onClick={() => navigate(v)}>
                  <ViewIcon view={v} />{VIEW_NAMES[v]}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="frame-side">
          <button type="button" className="btn btn-quiet" aria-pressed={url.tour} onClick={() => setUrl({ tour: !url.tour, panel: null })}>
            <span aria-hidden="true">{url.tour ? "■" : "▶"}</span>{url.tour ? "Stop tour" : "Play tour"}
          </button>
          {askOn && (
            <button type="button" className="btn btn-quiet" aria-pressed={url.panel === "ask"} onClick={() => setUrl({ panel: "ask" })}>
              Ask
            </button>
          )}
          <button type="button" className="btn btn-quiet" aria-pressed={url.panel === "methods"} onClick={() => setUrl({ panel: "methods" })}>
            Methods
          </button>
        </div>
      </header>

      {url.v === "calendar" && <RegionAtlas />}

      <section className="frame-toolbar" aria-label="Record filters">
        <label className="frame-region">
          <span className="label">Region</span>
          <select ref={regionSelect} className="field" value={region.id}
            onChange={(e) => setUrl({ r: e.target.value, box: null, from: null, to: null, ym: null })}>
            {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <div className="frame-range">
          <span className="label" aria-hidden="true">Years shown</span>
          <RangeSlider min={y0} max={y1} from={ymParts(from).year} to={ymParts(to).year}
            onChange={(a, b) => setUrl({ from: a === y0 ? null : toYm(a, 1), to: b === y1 ? null : toYm(b, 12) }, "replace")} />
        </div>
        <div className="frame-actions">
          <button type="button" className="btn" aria-pressed={url.panel === "area"} onClick={() => setUrl({ panel: "area" })}>
            {url.box ? "Area: your box" : "Area"}
          </button>
          <Downloads />
        </div>
      </section>

      <main id="view" className="frame-main" tabIndex={-1}>
        {children}
      </main>

      <footer className="frame-foot fine">
        <p>
          Fire detections from NASA FIRMS (MODIS Collection 6.1 and VIIRS 375 m). Outlines from Natural Earth.
          Overpass is a student project and is not a NASA product. It does not replace local fire authorities.
        </p>
        <button type="button" className="btn btn-quiet" onClick={() => setUrl({ panel: "keys" })}>Keyboard shortcuts <kbd>?</kbd></button>
      </footer>

      <nav className="frame-bottom" aria-label="Views">
        {VIEWS.map((v) => (
          <button key={v} type="button" aria-current={url.v === v ? "page" : undefined} onClick={() => navigate(v)}>
            <ViewIcon view={v} />{VIEW_NAMES[v]}
          </button>
        ))}
      </nav>

      {url.panel === "methods" && <Drawer title="Methods" onClose={close}><Suspense fallback={<p role="status">Loading methods…</p>}><Methods /></Suspense></Drawer>}
      {url.panel === "ask" && askOn && <Drawer title="Ask about the record" onClose={close}><Suspense fallback={<p role="status">Loading Ask…</p>}><Ask /></Suspense></Drawer>}
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
