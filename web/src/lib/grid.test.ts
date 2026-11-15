import { describe, expect, it } from "vitest";
import fixture from "../../../pipeline/tests/fixtures/grid_cases.json";
import { boxInside, cellCenter, cellIndex, localSolarDate } from "./grid";
import { predict } from "./link";
import { fireDaysInMonth, maskKey, parseNrtCsv } from "./live";

describe("gridding matches the pipeline fixture", () => {
  for (const c of fixture.cases) {
    it(`${c.lat}, ${c.lon} at ${c.acq_date} ${c.acq_time}`, () => {
      expect(cellIndex(c.lat, c.lon, fixture.grid)).toEqual({ ix: c.ix, iy: c.iy });
      expect(localSolarDate(c.acq_date, c.acq_time, c.lon)).toBe(c.date_local);
    });
  }

  it("puts a cell's centre back in that cell", () => {
    const { lat, lon } = cellCenter(463, 234, 0.25);
    expect(cellIndex(lat, lon, 0.25)).toEqual({ ix: 463, iy: 234 });
  });

  it("tests box containment on all four sides", () => {
    expect(boxInside([-65, -32, -64, -31], [-65.8, -35, -61.7, -29.5])).toBe(true);
    expect(boxInside([-66, -32, -64, -31], [-65.8, -35, -61.7, -29.5])).toBe(false);
  });
});

describe("live counting", () => {
  const head = "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight";
  const row = (lat: number, lon: number, date: string, time: string, conf: string) =>
    `${lat},${lon},330,0.4,0.4,${date},${time},N20,VIIRS,${conf},2.0NRT,290,5,D`;
  const bbox: [number, number, number, number] = [-65.8, -35, -61.7, -29.5];

  it("counts distinct cell-days, drops low confidence, masked cells and other months", () => {
    const csv = [
      head,
      row(-31.4, -64.2, "2026-11-03", "1745", "n"),
      row(-31.41, -64.21, "2026-11-03", "1750", "h"), // same cell, same day
      row(-31.4, -64.2, "2026-11-04", "1745", "n"), // same cell, next day
      row(-31.4, -64.2, "2026-11-05", "1745", "l"), // low confidence
      row(-33.005, -63.005, "2026-11-05", "1745", "n"), // on the static mask
      row(-31.4, -64.2, "2026-11-01", "0300", "n"), // local date is 31 October
      row(-20, -64.2, "2026-11-05", "1745", "n"), // outside the box
    ].join("\n");
    const mask = new Set([maskKey(-33.005, -63.005)]);
    expect(fireDaysInMonth(parseNrtCsv(csv), bbox, "2026-11", mask)).toBe(2);
  });

  it("returns no rows for an error page", () => {
    expect(parseNrtCsv("Invalid MAP_KEY.")).toEqual([]);
  });
});

describe("link prediction", () => {
  it("applies each known form and refuses unknown ones", () => {
    expect(predict({ model: "identity" }, 12)).toBe(12);
    expect(predict({ model: "M1", factor: 0.5 }, 12)).toBe(6);
    expect(predict({ model: "M3", a: 0, b: 1, smear: 1 }, 12)).toBeCloseTo(12, 10);
    expect(predict({ model: "M9" }, 12)).toBeNull();
  });
});
