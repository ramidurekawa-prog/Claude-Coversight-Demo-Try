/** Pure statistics. No randomness, no I/O. */

export function sum(a: readonly number[]): number {
  let s = 0;
  for (const x of a) s += x;
  return s;
}
export function mean(a: readonly number[]): number {
  return a.length ? sum(a) / a.length : 0;
}
export function variance(a: readonly number[]): number {
  if (a.length < 2) return 0;
  const m = mean(a);
  let s = 0;
  for (const x of a) s += (x - m) * (x - m);
  return s / (a.length - 1);
}
export function sd(a: readonly number[]): number {
  return Math.sqrt(variance(a));
}
export function median(a: readonly number[]): number {
  const b = [...a].sort((x, y) => x - y);
  const n = b.length;
  if (!n) return 0;
  return n % 2 ? (b[(n - 1) / 2] as number) : ((b[n / 2 - 1] as number) + (b[n / 2] as number)) / 2;
}
export function quantile(a: readonly number[], q: number): number {
  const b = [...a].sort((x, y) => x - y);
  if (!b.length) return 0;
  const p = (b.length - 1) * q;
  const lo = Math.floor(p);
  const hi = Math.ceil(p);
  return (b[lo] as number) + ((b[hi] as number) - (b[lo] as number)) * (p - lo);
}

/** Abramowitz–Stegun / Acklam normal quantile. */
export function zq(p: number): number {
  if (p <= 0 || p >= 1) throw new Error("zq domain");
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  let q: number;
  if (p < pl) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  if (p > 1 - pl) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  q = p - 0.5;
  const r = q * q;
  return ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) / (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
}

/** Student-t quantile via Cornish–Fisher expansion off the normal. Good to ~3dp for df ≥ 4. */
export function tq(p: number, df: number): number {
  const z = zq(p);
  const z2 = z * z;
  const z3 = z2 * z;
  const z5 = z3 * z2;
  const z7 = z5 * z2;
  const g1 = (z3 + z) / 4;
  const g2 = (5 * z5 + 16 * z3 + 3 * z) / 96;
  const g3 = (3 * z7 + 19 * z5 + 17 * z3 - 15 * z) / 384;
  const d = Math.max(df, 1);
  return z + g1 / d + g2 / (d * d) + g3 / (d * d * d);
}

/** Welch standard error of a difference in means. */
export function seDiff(a: readonly number[], b: readonly number[]): number {
  return Math.sqrt(variance(a) / Math.max(a.length, 1) + variance(b) / Math.max(b.length, 1));
}
export function welchDf(a: readonly number[], b: readonly number[]): number {
  const va = variance(a) / Math.max(a.length, 1);
  const vb = variance(b) / Math.max(b.length, 1);
  const num = (va + vb) * (va + vb);
  const den = (va * va) / Math.max(a.length - 1, 1) + (vb * vb) / Math.max(b.length - 1, 1);
  return den > 0 ? num / den : Math.max(a.length + b.length - 2, 1);
}

/** OLS slope of y on its index. */
export function slope(y: readonly number[]): number {
  const n = y.length;
  if (n < 2) return 0;
  const mx = (n - 1) / 2;
  const my = mean(y);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - mx) * ((y[i] as number) - my);
    den += (i - mx) * (i - mx);
  }
  return den ? num / den : 0;
}

export function pearson(x: readonly number[], y: readonly number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  const mx = mean(x.slice(0, n));
  const my = mean(y.slice(0, n));
  let s = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = (x[i] as number) - mx;
    const b = (y[i] as number) - my;
    s += a * b;
    dx += a * a;
    dy += b * b;
  }
  return dx && dy ? s / Math.sqrt(dx * dy) : 0;
}

/** Simple linear regression of y on x: slope, intercept, standard error of slope. */
export function ols(x: readonly number[], y: readonly number[]): { slope: number; intercept: number; seSlope: number; n: number } {
  const n = Math.min(x.length, y.length);
  if (n < 3) return { slope: 0, intercept: mean(y), seSlope: Infinity, n };
  const mx = mean(x.slice(0, n));
  const my = mean(y.slice(0, n));
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += ((x[i] as number) - mx) * ((y[i] as number) - my);
    den += ((x[i] as number) - mx) ** 2;
  }
  const b = den > 1e-12 ? num / den : 0;
  const a = my - b * mx;
  let rss = 0;
  for (let i = 0; i < n; i++) rss += ((y[i] as number) - (a + b * (x[i] as number))) ** 2;
  const seSlope = den > 1e-12 ? Math.sqrt(rss / Math.max(n - 2, 1) / den) : Infinity;
  return { slope: b, intercept: a, seSlope, n };
}

/** Largest-remainder apportionment: parts sum exactly to total after rounding. */
export function apportion(total: number, weights: readonly number[]): number[] {
  const w = sum(weights);
  if (!weights.length) return [];
  if (w <= 0) {
    const each = Math.floor(total / weights.length);
    const out = weights.map(() => each);
    out[0] = (out[0] as number) + (total - each * weights.length);
    return out;
  }
  const raw = weights.map((x) => (total * x) / w);
  const floors = raw.map((x) => Math.floor(x));
  let remainder = total - sum(floors);
  const order = raw.map((x, i) => ({ i, frac: x - Math.floor(x) })).sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (remainder <= 0) break;
    floors[i] = (floors[i] as number) + 1;
    remainder--;
  }
  return floors;
}
