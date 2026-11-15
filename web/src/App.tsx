import { lazy, Suspense, useMemo } from "react";
import { DataContext, type RegionData } from "./data/context";
import { loadMeta, loadMonthly, loadRegions, loadValidation, useLoad } from "./data/load";
import { Waiting } from "./parts/Finding";
import { Frame } from "./parts/Frame";
import { UrlContext, useUrlState, VIEW_NAMES, type View } from "./state/url";
import Calendar from "./views/Calendar";

const VIEWS: Record<View, React.ComponentType> = {
  calendar: Calendar,
  month: lazy(() => import("./views/ThisMonth")),
  season: NotBuilt,
  evidence: NotBuilt,
  scenes: NotBuilt,
};

function NotBuilt() {
  return <p>This view is not built yet.</p>;
}

export function App() {
  const urlState = useUrlState();
  const [url] = urlState;

  const regions = useLoad("regions", loadRegions);
  const id = regions.state === "ready" ? (regions.data.find((r) => r.id === url.r) ?? regions.data[0]).id : "";
  const files = useLoad(`region:${id}`, async () => {
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
      <div className="frame">
        <Waiting what="The fire record" error={error} />
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
