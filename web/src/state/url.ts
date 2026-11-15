import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { RampName } from "../lib/color";
import type { Box } from "../types";

export const VIEWS = ["calendar", "month", "season", "evidence", "scenes"] as const;
export type View = (typeof VIEWS)[number];
export const VIEW_NAMES: Record<View, string> = { calendar: "Calendar", month: "This month", season: "Season", evidence: "Evidence", scenes: "Scenes" };

export interface UrlState {
  /** region id; empty until regions load, then the first prepared region */
  r: string;
  v: View;
  from: string | null;
  to: string | null;
  box: Box | null;
  /** h = harmonized, r = raw records */
  mode: "h" | "r";
  /** counts or versus normal */
  color: "counts" | "normal";
  ramp: RampName;
  /** fd = fire-days, px = detections (raw records only) */
  unit: "fd" | "px";
  table: boolean;
  panel: "methods" | "ask" | "area" | "keys" | null;
  scene: "cliff" | "flyover";
  /** show the 3D scene rather than its 2D twin */
  d3: boolean;
  /** selected month in the flyover */
  ym: string | null;
  /** selected year on the dial */
  year: number | null;
  tour: boolean;
}

export const DEFAULTS: UrlState = {
  r: "", v: "calendar", from: null, to: null, box: null, mode: "r", color: "counts", ramp: "cividis", unit: "fd",
  table: false, panel: null, scene: "cliff", d3: true, ym: null, year: null, tour: false,
};

const YM = /^\d{4}-\d{2}$/;
const PANELS = ["methods", "ask", "area", "keys"] as const;

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function parseBox(text: string | null): Box | null {
  if (!text) return null;
  const n = text.split(",").map(Number);
  if (n.length !== 4 || n.some((v) => !Number.isFinite(v))) return null;
  const [w, s, e, north] = n;
  if (w >= e || s >= north || w < -180 || e > 180 || s < -90 || north > 90) return null;
  return [w, s, e, north];
}

export function parse(search: string): UrlState {
  const q = new URLSearchParams(search);
  const ym = (key: string) => (YM.test(q.get(key) ?? "") ? q.get(key) : null);
  const year = Number(q.get("y"));
  return {
    r: q.get("r") ?? "",
    v: pick(q.get("v"), VIEWS, DEFAULTS.v),
    from: ym("from"),
    to: ym("to"),
    box: parseBox(q.get("box")),
    mode: pick(q.get("mode"), ["h", "r"] as const, DEFAULTS.mode),
    color: pick(q.get("color"), ["counts", "normal"] as const, DEFAULTS.color),
    ramp: pick(q.get("ramp"), ["cividis", "greys"] as const, DEFAULTS.ramp),
    table: q.get("table") === "1",
    unit: pick(q.get("unit"), ["fd", "px"] as const, DEFAULTS.unit),
    panel: PANELS.find((p) => p === q.get("panel")) ?? null,
    scene: pick(q.get("scene"), ["cliff", "flyover"] as const, DEFAULTS.scene),
    d3: q.get("d3") !== "0",
    ym: ym("ym"),
    year: Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : null,
    tour: q.get("tour") === "1",
  };
}

export function serialize(s: UrlState): string {
  const q = new URLSearchParams();
  if (s.r) q.set("r", s.r);
  if (s.from) q.set("from", s.from);
  if (s.to) q.set("to", s.to);
  q.set("v", s.v);
  if (s.box) q.set("box", s.box.join(","));
  q.set("mode", s.mode);
  if (s.color !== DEFAULTS.color) q.set("color", s.color);
  if (s.ramp !== DEFAULTS.ramp) q.set("ramp", s.ramp);
  if (s.unit !== DEFAULTS.unit) q.set("unit", s.unit);
  if (s.table) q.set("table", "1");
  if (s.panel) q.set("panel", s.panel);
  if (s.scene !== DEFAULTS.scene) q.set("scene", s.scene);
  if (!s.d3) q.set("d3", "0");
  if (s.ym) q.set("ym", s.ym);
  if (s.year) q.set("y", String(s.year));
  if (s.tour) q.set("tour", "1");
  return `?${q.toString().replace(/%2C/g, ",")}`;
}

export type SetUrl = (patch: Partial<UrlState>, how?: "push" | "replace") => void;

/** The whole interface state, read from and written to the address bar. */
export function useUrlState(): [UrlState, SetUrl] {
  const [state, setState] = useState(() => parse(window.location.search));

  useEffect(() => {
    const onPop = () => setState(parse(window.location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const set = useCallback<SetUrl>((patch, how = "push") => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      const url = serialize(next);
      if (url !== window.location.search) {
        if (how === "push") window.history.pushState(null, "", url);
        else window.history.replaceState(null, "", url);
      }
      return next;
    });
  }, []);

  return [state, set];
}

export const UrlContext = createContext<[UrlState, SetUrl]>([DEFAULTS, () => undefined]);
export const useUrl = () => useContext(UrlContext);
