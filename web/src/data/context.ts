import { createContext, useContext } from "react";
import type { Meta, Monthly, Region, Validation } from "../types";

/** The files every view needs, loaded once per region by App. */
export interface RegionData {
  regions: Region[];
  region: Region;
  monthly: Monthly;
  validation: Validation;
  meta: Meta;
  /** first and last month in the record */
  span: [string, string];
  /** the visible range after the range slider */
  from: string;
  to: string;
}

export const DataContext = createContext<RegionData | null>(null);

export function useData(): RegionData {
  const data = useContext(DataContext);
  if (!data) throw new Error("useData called outside the loaded frame");
  return data;
}
