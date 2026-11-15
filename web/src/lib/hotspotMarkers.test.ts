import { describe, expect, it, vi, afterEach } from "vitest";
import { pointsFromCsv, animateHotspots } from "./hotspotMarkers";
import type { Map } from "maplibre-gl";

describe("hotspot presentation data", () => {
  it("keeps coordinates and distinguishes measured zero from missing power", () => {
    const points = pointsFromCsv("latitude,longitude,frp\r\n40,-120,0\r\n41,-121,500\r\n42,-122,\r\n");
    expect(points.map((p) => p.geometry.coordinates)).toEqual([[-120,40],[-121,41],[-122,42]]);
    expect(points.map((p) => p.properties?.intensity)).toEqual([0,1,0]);
    expect(points.map((p) => p.properties?.frp)).toEqual([0,500,null]);
  });
  it("rejects invalid positions and caps emphasis without changing measured power", () => {
    const points = pointsFromCsv("latitude,longitude,frp\n91,0,2\n,1,3\n1,181,3\nfoo,2,3\n1,2,1000");
    expect(points).toHaveLength(1);
    expect(points[0].properties).toEqual({frp:1000,intensity:1});
    expect(pointsFromCsv("wrong,columns\n1,2")).toEqual([]);
  });
});

describe("hotspot motion lifecycle", () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  it("stops for reduced motion, hidden tabs, and component cleanup", () => {
    vi.useFakeTimers();
    const motion = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const doc = { hidden: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal("window", { matchMedia: () => motion, setInterval, clearInterval });
    vi.stubGlobal("document", doc);
    const map = { setPaintProperty: vi.fn() };
    const cleanup = animateHotspots(map as unknown as Map);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(100);
    expect(map.setPaintProperty).toHaveBeenCalled();
    motion.matches = true;
    motion.addEventListener.mock.calls[0][1]();
    expect(vi.getTimerCount()).toBe(0);
    motion.matches = false;
    motion.addEventListener.mock.calls[0][1]();
    expect(vi.getTimerCount()).toBe(1);
    doc.hidden = true;
    doc.addEventListener.mock.calls[0][1]();
    expect(vi.getTimerCount()).toBe(0);
    cleanup();
    expect(doc.removeEventListener).toHaveBeenCalled();
    expect(motion.removeEventListener).toHaveBeenCalled();
  });
});

