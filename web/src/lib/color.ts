import { interpolateCividis } from "d3-scale-chromatic";

export const TOKENS = {
  overcast: "#E8ECEF",
  chalk: "#F6F8F9",
  night: "#0B2343",
  slate: "#566575",
  signal: "#1F5FD1",
  sodium: "#FFD84A",
  lightBlue: "#8FB8FF",
  plateMid: "#1D3A66",
} as const;

/** Chalk tints for marks on plates, as literals so an exported SVG keeps them. Same values as tokens.css. */
export const PLATE = {
  ink: "rgba(246, 248, 249, 0.92)",
  soft: "rgba(246, 248, 249, 0.62)",
  rule: "rgba(246, 248, 249, 0.5)",
  font: '"Atkinson Hyperlegible Next", "Atkinson Hyperlegible", system-ui, sans-serif',
} as const;

export type RampName = "cividis" | "greys";
type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
}

function parseColor(c: string): Rgb {
  if (c.startsWith("#")) return hexToRgb(c);
  const m = c.match(/\d+(\.\d+)?/g);
  if (!m) throw new Error(`Cannot parse color ${c}`);
  return [Number(m[0]), Number(m[1]), Number(m[2])];
}

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toSrgb = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);

export function relativeLuminance(color: string): number {
  const [r, g, b] = parseColor(color).map((v) => toLinear(v / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** sRGB -> OKLCH (Björn Ottosson's OKLab). */
export function toOklch(color: string): [number, number, number] {
  const [r, g, b] = parseColor(color).map((v) => toLinear(v / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), Math.atan2(B, A)];
}

function fromOklch([L, C, H]: [number, number, number]): string {
  const A = C * Math.cos(H);
  const B = C * Math.sin(H);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => Math.round(255 * Math.min(1, Math.max(0, toSrgb(v)))));
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function mixOklch(a: string, b: string, t: number): string {
  const [l1, c1, h1] = toOklch(a);
  const [l2, c2, h2] = toOklch(b);
  let dh = h2 - h1;
  if (dh > Math.PI) dh -= 2 * Math.PI;
  if (dh < -Math.PI) dh += 2 * Math.PI;
  return fromOklch([l1 + (l2 - l1) * t, c1 + (c2 - c1) * t, h1 + dh * t]);
}

/** Lowest ramp position used for a non-zero value, so the faintest burning is still distinct from the plate. */
const RAMP_FLOOR = 0.16;

/** Sequential ramp. t in [0, 1]; exactly 0 is the plate itself, not the ramp's first step. */
export function sequential(t: number, ramp: RampName = "cividis"): string {
  if (!(t > 0)) return TOKENS.night;
  const u = RAMP_FLOOR + (1 - RAMP_FLOOR) * Math.min(1, t);
  return ramp === "cividis" ? interpolateCividis(u) : mixOklch("#1A2B42", "#FFFFFF", u);
}

/** Diverging ramp for "versus normal". t in [-1, 1]: light blue below, plate mid-tone at 0, Sodium above. */
export function diverging(t: number): string {
  const c = Math.max(-1, Math.min(1, t));
  return mixOklch(TOKENS.plateMid, c < 0 ? TOKENS.lightBlue : TOKENS.sodium, Math.abs(c));
}

/** Text color that stays readable on a ramp color. */
export function inkOn(color: string): string {
  return relativeLuminance(color) > 0.3 ? TOKENS.night : TOKENS.chalk;
}
