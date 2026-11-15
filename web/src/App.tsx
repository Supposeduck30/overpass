import { lazy, Suspense, useMemo, useState } from "react";
import { DataContext, type RegionData } from "./data/context";
import { loadMeta, loadMonthly, loadRegions, loadValidation, useLoad } from "./data/load";
import { Waiting } from "./parts/Finding";
import { Frame } from "./parts/Frame";
import { UrlContext, useUrlState, VIEW_NAMES, type View } from "./state/url";
import Calendar from "./views/Calendar";

const VIEWS: Record<View, React.ComponentType> = {
  calendar: Calendar,
  month: lazy(() => import("./views/ThisMonth")),
  season: lazy(() => import("./views/Season")),
  evidence: lazy(() => import("./views/Evidence")),
  scenes: lazy(() => import("./views/Scenes")),
};

export function App() {
  const urlState = useUrlState();
  const [url, setUrl] = urlState;
  const [attempt, retry] = useState(0);

  const regions = useLoad(`regions:${attempt}`, loadRegions);
  const id = regions.state === "ready" ? (regions.data.find((r) => r.id === url.r) ?? regions.data[0]).id : "";
  const files = useLoad(`region:${id}:${attempt}`, async () => {
    if (!id) return null;
    const [monthly, validation, meta] = await Promise.all([loadMonthly(id), loadValidation(id), loadMeta()]);
    return { monthly, validation, meta };
  });

  const data = useMemo<RegionData | null>(() => {
    if (regions.state !== "ready" || files.state !== "ready" || !files.data) return null;
    const { monthly } = files.data;
    const span: [string, string] = [monthly.months[0].ym, monthly.months[monthly.months.length - 1].ym];
    const from = url.from && url.from >= span[0] && url.from <= span[1] ? url.from : span[0];
    const to = url.to && url.to >= from && url.to <= span[1] ? url.to : span[1];
    return { regions: regions.data, region: regions.data.find((r) => r.id === id)!, ...files.data, span, from, to };
  }, [regions, files, id, url.from, url.to]);

  const error = regions.state === "error" ? regions.message : files.state === "error" ? files.message : undefined;
  if (!data) {
    return (
      <div className="frame frame-observatory frame-loading">
        <header className="frame-head">
          <a className="wordmark" href="./">Overpass</a>
          <span className="frame-tagline">A satellite fire atlas</span>
        </header>
        <main className="frame-main">
          {error ? (
            <div className="frame-recovery" role="alert">
              <h1 className="finding-title">The fire record could not be loaded</h1>
              <p>{error}</p>
              <div className="frame-recovery-actions">
                <button type="button" className="btn" onClick={() => retry((n) => n + 1)}>Try again</button>
                {regions.state === "ready" && (
                  <label>
                    <span className="sr-only">Region</span>
                    <select className="field" value={id}
                      onChange={(e) => setUrl({ r: e.target.value, box: null, from: null, to: null, ym: null })}>
                      {regions.data.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </label>
                )}
              </div>
            </div>
          ) : <Waiting what="The fire record" />}
        </main>
      </div>
    );
  }

  const ViewNow = VIEWS[url.v];
  return (
    <UrlContext.Provider value={urlState}>
      <DataContext.Provider value={data}>
        <Frame>
          <Suspense fallback={<Waiting what={VIEW_NAMES[url.v]} />}>
            <ViewNow />
          </Suspense>
        </Frame>
      </DataContext.Provider>
    </UrlContext.Provider>
  );
}
