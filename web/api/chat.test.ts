import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, runTool } from "./chat";

const ORIGIN = "http://site";

/** Serves public/data like the deployed site; the live FIRMS route is down, so the committed file is used. */
vi.stubGlobal("fetch", async (url: string) => {
  const path = url.replace(ORIGIN, "");
  if (path.startsWith("/api/")) return new Response("", { status: 503 });
  try {
    return new Response(await readFile(`public${path}`, "utf8"), { status: 200 });
  } catch {
    return new Response("", { status: 404 });
  }
});

afterEach(() => vi.unstubAllEnvs());

describe("Ask tools", () => {
  it("lists the prepared regions", async () => {
    const out = (await runTool(ORIGIN, "list_regions", {})) as { id: string }[];
    expect(out.map((r) => r.id)).toContain("cordoba");
  });

  it("returns months with intervals and the satellite's own count", async () => {
    const out = (await runTool(ORIGIN, "get_monthly", { region: "cordoba", from: "2011-12", to: "2012-03" })) as {
      months: { ym: string; source: string; lo: number; hi: number; recordedBySourceSatellite: number | null }[];
    };
    expect(out.months.map((m) => m.ym)).toEqual(["2011-12", "2012-01", "2012-02", "2012-03"]);
    expect(out.months[0].source).toBe("aqua-translated");
    expect(out.months[2].source).toBe("snpp");
    expect(out.months[2].lo).toBe(out.months[2].hi);
    expect(out.months.every((m) => m.recordedBySourceSatellite != null)).toBe(true);
  });

  it("answers month status from committed files when the live route is down", async () => {
    const out = (await runTool(ORIGIN, "get_month_status", { region: "cordoba" })) as { current: { ym: string }; pastSameMonths: unknown[] };
    expect(out.current.ym).toMatch(/^\d{4}-\d{2}$/);
    expect(out.pastSameMonths.length).toBeGreaterThan(10);
  });

  it("drops point lists from validation", async () => {
    const out = (await runTool(ORIGIN, "get_validation", { region: "cordoba" })) as { forward: Record<string, unknown>; notes: string[] };
    expect(out.forward.points).toBeUndefined();
    expect(out.notes.length).toBeGreaterThan(0);
  });

  it("rejects region ids that are not plain ids", async () => {
    await expect(runTool(ORIGIN, "get_season_clock", { region: "../meta" })).rejects.toThrow();
  });

  it("reports Ask as off without a key", async () => {
    vi.stubEnv("LLM_API_KEY", "");
    expect(await (await GET()).json()).toEqual({ enabled: false });
  });
});
