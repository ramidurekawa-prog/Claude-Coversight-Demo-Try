/**
 * Control charts (E2 EWMA, E3 CUSUM) with a stated false-alarm rate, naming the
 * day a drift started. Repeat floors are not used.
 */
import { mean, sd } from "./stats";
import type { IsoDate } from "./dates";

export interface SeriesPoint {
  date: IsoDate;
  v: number;
}

export interface EwmaPoint extends SeriesPoint {
  z: number;
  ucl: number;
  lcl: number;
  mu: number;
  signal: "high" | "low" | null;
}

export interface EwmaChart {
  points: EwmaPoint[];
  mu: number;
  sd: number;
  /** Per-observation false-alarm probability implied by L and lambda. */
  alpha: number;
  lambda: number;
  L: number;
  baselineN: number;
}

export function ewmaChart(series: readonly SeriesPoint[], opts: { lambda?: number; L?: number; baselineN?: number } = {}): EwmaChart {
  const lambda = opts.lambda ?? 0.25;
  const L = opts.L ?? 3.0;
  const baselineN = Math.max(2, Math.min(opts.baselineN ?? 28, series.length));
  const base = series.slice(0, baselineN).map((p) => p.v);
  const mu = mean(base);
  const s = sd(base) || 1e-9;
  let z = mu;
  const out: EwmaPoint[] = [];
  for (let i = 0; i < series.length; i++) {
    const p = series[i] as SeriesPoint;
    z = lambda * p.v + (1 - lambda) * z;
    const k = i + 1;
    const lim = L * s * Math.sqrt((lambda / (2 - lambda)) * (1 - Math.pow(1 - lambda, 2 * k)));
    out.push({ date: p.date, v: p.v, z, ucl: mu + lim, lcl: mu - lim, mu, signal: z > mu + lim ? "high" : z < mu - lim ? "low" : null });
  }
  // In-control ARL for L=3, lambda=0.25 is roughly 500 observations.
  return { points: out, mu, sd: s, alpha: 1 / 500, lambda, L, baselineN };
}

export interface CusumPoint extends SeriesPoint {
  sHi: number;
  sLo: number;
  signal: "high" | "low" | null;
}
export interface CusumChart {
  points: CusumPoint[];
  mu: number;
  sd: number;
  h: number;
  k: number;
  baselineN: number;
}

export function cusumChart(series: readonly SeriesPoint[], opts: { k?: number; h?: number; baselineN?: number } = {}): CusumChart {
  const k = opts.k ?? 0.5;
  const h = opts.h ?? 4.0;
  const baselineN = Math.max(2, Math.min(opts.baselineN ?? 28, series.length));
  const base = series.slice(0, baselineN).map((p) => p.v);
  const mu = mean(base);
  const s = sd(base) || 1e-9;
  let sHi = 0;
  let sLo = 0;
  const out: CusumPoint[] = [];
  for (const p of series) {
    const x = (p.v - mu) / s;
    sHi = Math.max(0, sHi + x - k);
    sLo = Math.max(0, sLo - x - k);
    out.push({ date: p.date, v: p.v, sHi, sLo, signal: sHi > h ? "high" : sLo > h ? "low" : null });
  }
  return { points: out, mu, sd: s, h, k, baselineN };
}

export interface DriftOnset {
  onsetIndex: number;
  onsetDate: IsoDate;
  signalIndex: number;
  signalDate: IsoDate;
  direction: "high" | "low";
}

/**
 * Single change-point estimate for a mean shift (maximum-likelihood): the index
 * that best splits the segment into two means. Used to DATE an onset once a
 * control chart has DETECTED one; the chart alone walks back too far when a
 * baseline sits slightly off the true level.
 */
export function changePoint(values: readonly number[], direction?: "high" | "low"): number | null {
  const n = values.length;
  if (n < 6) return null;
  let best = -Infinity;
  let bestIdx: number | null = null;
  let pre = 0;
  const total = values.reduce((a, b) => a + b, 0);
  for (let t = 3; t <= n - 3; t++) {
    pre += values[t - 1] as number;
    const m1 = pre / t;
    const m2 = (total - pre) / (n - t);
    const diff = m2 - m1;
    if (direction === "high" && diff <= 0) continue;
    if (direction === "low" && diff >= 0) continue;
    const stat = Math.abs(diff) * Math.sqrt((t * (n - t)) / n);
    if (stat > best) {
      best = stat;
      bestIdx = t;
    }
  }
  return bestIdx;
}

/**
 * First sustained signal in the requested direction, and the day the drift
 * actually started: the change-point estimate over the run-up to the signal,
 * bounded below by where the CUSUM accumulator last sat at zero.
 */
export function driftOnset(cusum: CusumChart, opts: { direction?: "high" | "low"; lookback?: number } = {}): DriftOnset | null {
  const p = cusum.points;
  let firstSig = -1;
  for (let i = 0; i < p.length; i++) {
    const sig = p[i]?.signal;
    if (sig && (!opts.direction || sig === opts.direction)) {
      firstSig = i;
      break;
    }
  }
  if (firstSig < 0) return null;
  const dir = (p[firstSig] as CusumPoint).signal as "high" | "low";
  let j = firstSig;
  while (j > 0 && (dir === "high" ? (p[j - 1] as CusumPoint).sHi > 0 : (p[j - 1] as CusumPoint).sLo > 0)) j--;
  // Refine the walk-back with a change-point over the run-up (bounded window).
  const lo = Math.max(0, firstSig - (opts.lookback ?? 120));
  const hi = Math.min(p.length - 1, firstSig + 6);
  const seg = p.slice(lo, hi + 1).map((x) => x.v);
  const cp = changePoint(seg, dir);
  let onsetIndex = j;
  if (cp != null) {
    const cpIdx = lo + cp;
    if (cpIdx >= j && cpIdx <= firstSig) onsetIndex = cpIdx;
  }
  return {
    onsetIndex,
    onsetDate: (p[onsetIndex] as CusumPoint).date,
    signalIndex: firstSig,
    signalDate: (p[firstSig] as CusumPoint).date,
    direction: dir,
  };
}
