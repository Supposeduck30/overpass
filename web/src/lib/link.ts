/** Applies a fitted link from monthly.json. Mirrors pipeline/lib/models.py for the forms a link can take. */

export type LinkParams = Record<string, number | string | number[]>;

/** Returns null for a model form this code does not know, so callers fall back instead of guessing. */
export function predict(params: LinkParams, m: number): number | null {
  const num = (key: string) => (typeof params[key] === "number" ? (params[key] as number) : null);
  switch (params.model) {
    case "identity":
      return m;
    case "M0":
    case "M1": {
      const factor = num("factor");
      return factor == null ? null : factor * m;
    }
    case "M3": {
      const a = num("a");
      const b = num("b");
      const smear = num("smear");
      return a == null || b == null || smear == null ? null : Math.max(Math.exp(a + b * Math.log1p(m)) * smear - 1, 0);
    }
    default:
      return null;
  }
}
