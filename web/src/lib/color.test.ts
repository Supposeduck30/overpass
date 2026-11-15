import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TOKENS, contrastRatio, diverging, sequential, toOklch } from "./color";

const theme = readFileSync(new URL("../styles/tokens.css", import.meta.url), "utf-8");

const AA_TEXT = 4.5;
const AA_GRAPHIC = 3;

function themeColor(token: string): string {
  const color = theme.match(new RegExp(`--${token}:\\s*(#[0-9a-f]+);`, "i"))?.[1];
  if (!color) throw new Error(`Missing theme color --${token}`);
  return color;
}

const TEXT_PAIRS: [string, string, string][] = [
  ["body text on workspace", themeColor("chalk"), themeColor("workspace")],
  ["muted text on workspace", themeColor("text-muted"), themeColor("workspace")],
  ["muted text on surface", themeColor("text-muted"), themeColor("surface")],
  ["control text on hover", themeColor("chalk"), themeColor("control-hover")],
  ["accent links on surface", themeColor("sodium"), themeColor("surface")],
  ["selected control text on amber", themeColor("night"), themeColor("sodium")],
  ["chalk on night", TOKENS.chalk, TOKENS.night],
  ["sodium on night", TOKENS.sodium, TOKENS.night],
  ["light blue on night", TOKENS.lightBlue, TOKENS.night],
  ["plate soft ink (chalk at 68%) on night", "#B1AEAB", TOKENS.night],
];

describe("contrast", () => {
  for (const [name, fg, bg] of TEXT_PAIRS) {
    it(`${name} meets AA`, () => {
      const ratio = contrastRatio(fg, bg);
      console.log(`${name}: ${ratio.toFixed(2)}:1`);
      expect(ratio).toBeGreaterThanOrEqual(AA_TEXT);
    });
  }

  it("focus rings and control borders meet the 3:1 graphic threshold", () => {
    expect(contrastRatio(themeColor("sodium"), themeColor("control-hover"))).toBeGreaterThanOrEqual(AA_GRAPHIC);
    expect(contrastRatio(themeColor("control-border"), themeColor("control"))).toBeGreaterThanOrEqual(AA_GRAPHIC);
  });
});

function lightnessSteps(color: (t: number) => string, from: number, to: number): number[] {
  return Array.from({ length: 41 }, (_, i) => toOklch(color(from + ((to - from) * i) / 40))[0]);
}

function isRising(values: number[]): boolean {
  return values.every((v, i) => i === 0 || v >= values[i - 1] - 0.004);
}

describe("ramps", () => {
  it("sequential ramps rise in lightness from the plate", () => {
    for (const ramp of ["cividis", "greys"] as const) {
      const steps = lightnessSteps((t) => sequential(t, ramp), 0, 1);
      expect(isRising(steps)).toBe(true);
      expect(steps[1]).toBeGreaterThan(steps[0]);
    }
  });

  it("each diverging arm rises in lightness away from normal", () => {
    expect(isRising(lightnessSteps(diverging, 0, 1))).toBe(true);
    expect(isRising(lightnessSteps(diverging, 0, -1))).toBe(true);
  });

  it("the two diverging ends end at similar lightness, so neither arm reads as stronger", () => {
    const below = toOklch(diverging(-1))[0];
    const above = toOklch(diverging(1))[0];
    console.log(`diverging ends: below L=${below.toFixed(3)}, above L=${above.toFixed(3)}`);
    expect(Math.abs(below - above)).toBeLessThan(0.15);
  });
});
