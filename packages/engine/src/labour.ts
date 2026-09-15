/**
 * Labour — C1 measured service rate, C2 square-root staffing requirement.
 *
 * Covers ÷ server-hours is the REALISED rate and already contains whatever
 * safety staffing the room runs; the capability we want is the MARGINAL rate:
 * regress server-hours on covers across the comparable set and take the
 * reciprocal of the slope. The intercept is the room's fixed floor. No cover
 * cap anywhere.
 */
import type { Service } from "./register";
import { mean, quantile, sum } from "./stats";

export interface ServiceRate {
  /** Marginal covers per server-hour; null when the slope is not identified to ±8%. */
  mu: number | null;
  slope: number;
  seSlope: number;
  intercept: number;
  /** Total paid hours ÷ server hours (ratio of sums). */
  rosterRatio: number;
  n: number;
  nAll: number;
  floorHours: number;
  relSe: number;
}

export function measureRate(services: readonly Service[], serverHoursFn: (s: Service) => number, totalHoursFn: (s: Service) => number): ServiceRate {
  const sorted = [...services].sort((a, b) => a.covers - b.covers);
  const floorH = quantile(sorted.map(serverHoursFn), 0.1);
  let fit = services.filter((s) => serverHoursFn(s) > floorH * 1.12);
  if (fit.length < Math.max(12, services.length * 0.35)) fit = sorted.slice(Math.floor(sorted.length * 0.4));
  const xs = fit.map((s) => s.covers);
  const ys = fit.map(serverHoursFn);
  const mx = mean(xs);
  const my = mean(ys);
  let n = 0;
  let d = 0;
  for (let i = 0; i < xs.length; i++) {
    n += ((xs[i] as number) - mx) * ((ys[i] as number) - my);
    d += ((xs[i] as number) - mx) ** 2;
  }
  const slope = d > 1e-9 ? n / d : 0;
  const resid = ys.map((y, i) => y - (my + slope * ((xs[i] as number) - mx)));
  const seSlope = d > 1e-9 ? Math.sqrt(sum(resid.map((r) => r * r)) / Math.max(xs.length - 2, 1) / d) : Infinity;
  const relSe = slope > 1e-9 ? seSlope / slope : Infinity;
  // Honest abstention: a service rate that cannot be estimated to ±8% is not reported.
  const mu = slope > 1e-4 && relSe <= 0.08 ? 1 / slope : null;
  // Ratio of sums, not the mean of ratios (Jensen).
  const rosterRatio = sum(services.map(totalHoursFn)) / Math.max(0.25, sum(services.map(serverHoursFn)));
  return { mu, slope, seSlope, intercept: my - slope * mx, rosterRatio, n: fit.length, nAll: services.length, floorHours: floorH, relSe };
}

/** C2 — square-root staffing requirement in total paid hours. */
export function requiredHours(covers: number, dpHours: number, mu: number, rosterRatio: number, z = 0.6): number {
  const lam = covers / dpHours;
  const nStar = Math.max(2, lam / mu + z * Math.sqrt(Math.max(lam / mu, 0.01)));
  return nStar * dpHours * rosterRatio;
}

export function requiredHoursSe(covers: number, dpHours: number, rate: ServiceRate, z = 0.6): number | null {
  if (!rate.mu) return null;
  const mu = rate.mu;
  const lam = covers / dpHours;
  const r = lam / mu;
  const seMu = rate.relSe * mu;
  const dReq = (r / mu + ((z * 0.5) / Math.sqrt(Math.max(r, 0.01))) * (r / mu)) * dpHours * rate.rosterRatio;
  return Math.abs(dReq) * seMu;
}
