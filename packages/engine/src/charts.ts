/**
 * Control charts (E2 EWMA, E3 CUSUM) with a stated false-alarm rate, naming the
 * day a drift started. Repeat floors are not used.
 */
import { mean, sd } from "./stats.js";
import type { IsoDate } from "./dates.js";

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

/** First sustained signal, and the day the drift actually started (walk the accumulator back to zero). */
export function driftOnset(cusum: CusumChart): DriftOnset | null {
  const p = cusum.points;
  let firstSig = -1;
  for (let i = 0; i < p.length; i++) {
    if (p[i]?.signal) {
      firstSig = i;
      break;
    }
  }
  if (firstSig < 0) return null;
  const dir = (p[firstSig] as CusumPoint).signal as "high" | "low";
  let j = firstSig;
  while (j > 0 && (dir === "high" ? (p[j - 1] as CusumPoint).sHi > 0 : (p[j - 1] as CusumPoint).sLo > 0)) j--;
  return {
    onsetIndex: j,
    onsetDate: (p[j] as CusumPoint).date,
    signalIndex: firstSig,
    signalDate: (p[firstSig] as CusumPoint).date,
    direction: dir,
  };
}
