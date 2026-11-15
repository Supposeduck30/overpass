import type { Sat, Source } from "../types";

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const MONTH_INITIALS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

export const SAT_NAMES: Record<Sat, string> = { aqua: "Aqua", terra: "Terra", snpp: "S-NPP", noaa20: "NOAA-20", noaa21: "NOAA-21" };

const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const one = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Counts: whole numbers, with one decimal only below 10 where it matters. */
export function count(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "no data";
  return v < 10 && v % 1 !== 0 ? one.format(v) : whole.format(v);
}

export function times(v: number, digits = 1): string {
  return `${v.toFixed(digits)} times`;
}

export function percent(v: number | null | undefined, digits = 0): string {
  return v == null ? "no data" : `${(100 * v).toFixed(digits)}%`;
}

export function signed(v: number, digits = 0): string {
  const s = Math.abs(v).toFixed(digits);
  return v < 0 ? `−${s}` : `+${s}`;
}

export function pValue(p: number): string {
  return p < 0.001 ? "p < 0.001" : `p = ${p.toFixed(p < 0.01 ? 3 : 2)}`;
}

export function ymParts(ym: string): { year: number; month: number } {
  return { year: Number(ym.slice(0, 4)), month: Number(ym.slice(5, 7)) };
}

export function toYm(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** "Sep 2008" */
export function monthLabel(ym: string, long = false): string {
  const { year, month } = ymParts(ym);
  return `${(long ? MONTHS_LONG : MONTHS)[month - 1]} ${year}`;
}

export function sourceSat(source: Source): Sat {
  return source === "snpp" ? "snpp" : (source.replace("-translated", "") as Sat);
}

/** "translated from Aqua" or "measured by S-NPP" */
export function sourcePhrase(source: Source): string {
  return source === "snpp" ? "measured by S-NPP" : `translated from ${SAT_NAMES[sourceSat(source)]}`;
}

export function ordinal(n: number): string {
  const r = n % 100;
  const suffix = r >= 11 && r <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
}

/** "14 Nov 18:00 UTC" */
export function utcStamp(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${hh}:${mm} UTC`;
}

export function csvCell(v: string | number | boolean | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  return [header.join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n") + "\n";
}

export function saveFile(name: string, content: string | Blob, type = "text/csv"): void {
  const blob = typeof content === "string" ? new Blob([content], { type }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
