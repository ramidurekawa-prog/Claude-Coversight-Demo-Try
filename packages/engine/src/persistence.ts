/**
 * Persistence — Doctrine 9, G12. Exponential decay fit on the post-window
 * weekly effect series. Structural if the decay interval includes zero;
 * durable if the half-life exceeds 26 weeks; upkeep-dependent under 8.
 */
import type { IsoDate } from "./dates.js";
import type { DatedValue } from "./measure.js";
import { mean, sd, slope, sum } from "./stats.js";

export type PersistenceClass = "structural" | "durable" | "upkeep";

export interface PersistenceResult {
  status: "not_assessed" | "holding" | "decaying";
  label?: string;
  cls?: PersistenceClass;
  note?: string;
  halfLifeWeeks?: number;
  slopePerWeek?: number;
  ciLo?: number;
  ciHi?: number;
  includesZero?: boolean;
  checks: number;
  elapsedWeeks?: number;
  /** Latest weekly effect ÷ first weekly effect after the window. */
  retention?: number;
  series?: DatedValue[];
}

export function persistence(series: readonly DatedValue[], execDate: IsoDate): PersistenceResult {
  const pts = series.filter((p) => p.date > execDate);
  if (pts.length < 3) return { status: "not_assessed", label: "Persistence not yet assessed", checks: 0 };
  const ys = pts.map((p) => Math.max(1, p.y));
  const ln = ys.map((y) => Math.log(y));
  const slopePerWeek = slope(ln);
  const resid = ln.map((y, i) => y - ((ln[0] as number) + slopePerWeek * i));
  const sdResid = sd(resid);
  const idx = ln.map((_, i) => i);
  const mi = mean(idx);
  const sxx = sum(idx.map((i) => (i - mi) ** 2));
  const seSlope = ln.length > 2 && sxx > 0 ? sdResid / Math.sqrt(sxx) : 1;
  const ciLo = slopePerWeek - 1.96 * seSlope;
  const ciHi = slopePerWeek + 1.96 * seSlope;
  const includesZero = ciLo <= 0 && ciHi >= 0;
  const halfLifeWeeks = slopePerWeek < 0 ? Math.log(2) / -slopePerWeek : Infinity;
  let cls: PersistenceClass;
  let note: string;
  if (includesZero) {
    cls = "structural";
    note = "Decay rate's interval includes zero. Accrues for 52 weeks, then retires into the baseline. The proof and the invoice history remain.";
  } else if (halfLifeWeeks > 26) {
    cls = "durable";
    note = "Half-life beyond 26 weeks. Accrues at the decayed rate; re-verified once a quarter on a sample.";
  } else if (halfLifeWeeks < 8) {
    cls = "upkeep";
    note = "Half-life under 8 weeks. Accrual falls automatically, and a maintenance action surfaces before the value disappears rather than after.";
  } else {
    cls = "durable";
    note = "Half-life between 8 and 26 weeks. Accrues at the decayed rate.";
  }
  const checks = Math.floor(pts.length / 4);
  const retention = (ys[ys.length - 1] as number) / (ys[0] as number);
  return {
    status: retention < 0.6 ? "decaying" : "holding",
    cls,
    note,
    halfLifeWeeks,
    slopePerWeek,
    ciLo,
    ciHi,
    includesZero,
    checks,
    elapsedWeeks: pts.length,
    retention,
    series: [...pts],
  };
}

/** Decay multiplier for week w after eligibility, by persistence class. */
export function decayAt(cls: PersistenceClass | undefined, halfLifeWeeks: number | undefined, weekIndex: number): number {
  if (!cls || cls === "structural") return 1;
  if (cls === "upkeep") return Math.pow(0.5, weekIndex / Math.max(halfLifeWeeks ?? 1, 1));
  return Math.pow(0.5, weekIndex / Math.max(halfLifeWeeks ?? 52, 52));
}
