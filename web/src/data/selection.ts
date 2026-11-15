import { useMemo } from "react";
import { boxSeries, cellValues, type CellValue } from "../lib/series";
import { useUrl } from "../state/url";
import type { Cells } from "../types";
import { useData } from "./context";
import { loadCells, useLoad } from "./load";

export interface Selection {
  /** every month of the record for the region or the drawn box */
  months: CellValue[];
  boxed: boolean;
  /** 0.25° cells with any burning inside the box; null for a whole region */
  cellCount: number | null;
  cells: Cells | null;
  loading: boolean;
  error?: string;
}

/** The monthly record the views draw: the region's, or a drawn box summed from cells.json. */
export function useSelection(): Selection {
  const [url] = useUrl();
  const { region, monthly } = useData();
  const cells = useLoad(url.box ? `cells:${region.id}` : "cells:none", () => (url.box ? loadCells(region.id) : Promise.resolve(null)));
  const unit = url.box ? "fd" : url.unit;

  return useMemo(() => {
    const whole = { months: cellValues(monthly, unit), boxed: false, cellCount: null, cells: null };
    if (!url.box) return { ...whole, loading: false };
    if (cells.state === "error") return { ...whole, loading: false, error: cells.message };
    if (cells.state === "loading" || !cells.data) return { ...whole, loading: true };
    return { ...boxSeries(monthly, cells.data, url.box), boxed: true, cells: cells.data, loading: false };
  }, [monthly, unit, url.box, cells]);
}

export function inRange(months: CellValue[], from: string, to: string): CellValue[] {
  return months.filter((m) => m.ym >= from && m.ym <= to);
}
