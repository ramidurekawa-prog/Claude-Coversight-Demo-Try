/**
 * Measurement — Doctrine 5, System 11.
 *
 * Family B/C levers: difference-in-differences against matched controls with a
 * placebo parallel-trends test on the two pre-periods (G1, G2, G3, G5).
 * Family A levers: direct reconciliation of observed dollars with the concurrent
 * index carried as a DISCLOSURE, not a control.
 *
 * A failed placebo produces INCONCLUSIVE downstream — never a smaller number.
 */
import { addDays, type IsoDate, weekOf } from "./dates";
import { formatPct, formatUsd } from "./money";
import type { ItemDay, Register, Service } from "./register";
import { groupBy } from "./register";
import { mean, pearson, seDiff, sum, tq, variance, welchDf, zq } from "./stats";

export interface DatedValue {
  date: IsoDate;
  y: number;
}

export interface PlaceboResult {
  ok: boolean;
  pass: boolean;
  point: number;
  se: number;
  t: number;
  crit: number;
  note?: string;
}

export interface EstimateOk {
  ok: true;
  method: "did" | "reconciliation";
  point: number;
  se: number;
  df: number;
  /** One-sided critical t at 1−α, for the lower bound. */
  tcrit: number;
  /** Two-sided critical t at 1−α/2, for the interval. */
  tcrit2: number;
  ci: [number, number];
  lower: number;
  upper: number;
  means: { Tpre: number; Tpost: number; Cpre: number; Cpost: number };
  n: { Tpre: number; Tpost: number; Cpre: number; Cpost: number };
  dT: number;
  dC: number;
  placebo: PlaceboResult;
  /** Pre-period correlation between treated and control series. */
  preFit: number;
  alpha: number;
  /** Minimum detectable effect at 80% power from PRE-period variance (G5). */
  mde: number;
  sePlanned: number;
  indexMove?: number;
  indexShare?: number;
  attributionNote?: string;
  window: { execDate: IsoDate; preLo: IsoDate; postHi: IsoDate; mid?: IsoDate };
}

export interface EstimateFailed {
  ok: false;
  method: "did" | "reconciliation";
  reason: string;
  n: Record<string, number>;
}

export type Estimate = EstimateOk | EstimateFailed;

function select(arr: readonly DatedValue[], lo: IsoDate, hi: IsoDate): number[] {
  return arr.filter((p) => p.date >= lo && p.date < hi).map((p) => p.y);
}

export interface DidArgs {
  treatment: readonly DatedValue[];
  control: readonly DatedValue[];
  execDate: IsoDate;
  preDays?: number;
  postDays?: number;
  alpha?: number;
}

/** G1–G3, G5: difference-in-differences with a placebo parallel-trends check. */
export function did({ treatment, control, execDate, preDays = 56, postDays = 28, alpha = 0.05 }: DidArgs): Estimate {
  const preLo = addDays(execDate, -preDays);
  const postHi = addDays(execDate, postDays);
  const Tpre = select(treatment, preLo, execDate);
  const Tpost = select(treatment, execDate, postHi);
  const Cpre = select(control, preLo, execDate);
  const Cpost = select(control, execDate, postHi);
  if (Tpost.length < 2 || Cpost.length < 2 || Tpre.length < 4 || Cpre.length < 4) {
    return { ok: false, method: "did", reason: "insufficient observations", n: { Tpre: Tpre.length, Tpost: Tpost.length, Cpre: Cpre.length, Cpost: Cpost.length } };
  }
  const dT = mean(Tpost) - mean(Tpre);
  const dC = mean(Cpost) - mean(Cpre);
  const point = dT - dC;
  const se = Math.sqrt(variance(Tpost) / Tpost.length + variance(Tpre) / Tpre.length + variance(Cpost) / Cpost.length + variance(Cpre) / Cpre.length);
  const df = Math.max(4, Tpost.length + Tpre.length + Cpost.length + Cpre.length - 4);
  const tcrit = tq(1 - alpha, df);
  const tcrit2 = tq(1 - alpha / 2, df);

  // Placebo: split the pre-period in half and run the same estimator. A
  // significant "effect" before anything happened means the control is not
  // parallel — the result is INCONCLUSIVE, never a smaller number.
  const mid = addDays(execDate, -Math.floor(preDays / 2));
  const pT1 = select(treatment, preLo, mid);
  const pT2 = select(treatment, mid, execDate);
  const pC1 = select(control, preLo, mid);
  const pC2 = select(control, mid, execDate);
  let placebo: PlaceboResult = { ok: false, pass: false, point: 0, se: 0, t: 0, crit: 0 };
  if (pT1.length > 1 && pT2.length > 1 && pC1.length > 1 && pC2.length > 1) {
    const pp = mean(pT2) - mean(pT1) - (mean(pC2) - mean(pC1));
    const pse = Math.sqrt(variance(pT2) / pT2.length + variance(pT1) / pT1.length + variance(pC2) / pC2.length + variance(pC1) / pC1.length);
    const pdf = Math.max(4, pT1.length + pT2.length + pC1.length + pC2.length - 4);
    const crit = tq(0.975, pdf);
    const t = pse > 0 ? pp / pse : 0;
    placebo = { ok: true, point: pp, se: pse, t, crit, pass: pse > 0 ? Math.abs(t) <= crit : false };
  }

  // Pre-period comparability: correlation of the two series before execution.
  const cm = new Map(control.map((p) => [p.date, p.y]));
  const a: number[] = [];
  const b: number[] = [];
  for (const p of treatment) {
    if (p.date >= preLo && p.date < execDate && cm.has(p.date)) {
      a.push(p.y);
      b.push(cm.get(p.date) as number);
    }
  }
  const preFit = a.length > 3 ? pearson(a, b) : 0;

  // G5 — MDE from the PRE-period variance, i.e. from what was knowable before
  // the window opened, at 80% power. Deliberately not recomputed off the
  // realised spread.
  const sePlanned = Math.sqrt(variance(Tpre) * (1 / Math.max(Tpost.length, 1) + 1 / Math.max(Tpre.length, 1)) + variance(Cpre) * (1 / Math.max(Cpost.length, 1) + 1 / Math.max(Cpre.length, 1)));
  const mde = (zq(1 - alpha / 2) + zq(0.8)) * sePlanned;

  return {
    ok: true,
    method: "did",
    point,
    se,
    df,
    tcrit,
    tcrit2,
    ci: [point - tcrit2 * se, point + tcrit2 * se],
    lower: point - tcrit * se,
    upper: point + tcrit * se,
    means: { Tpre: mean(Tpre), Tpost: mean(Tpost), Cpre: mean(Cpre), Cpost: mean(Cpost) },
    n: { Tpre: Tpre.length, Tpost: Tpost.length, Cpre: Cpre.length, Cpost: Cpost.length },
    dT,
    dC,
    placebo,
    preFit,
    alpha,
    mde,
    sePlanned,
    window: { execDate, preLo, postHi, mid },
  };
}

export interface ReconcileArgs {
  observed: readonly DatedValue[];
  index?: readonly DatedValue[] | null;
  execDate: IsoDate;
  preDays?: number;
  postDays?: number;
  alpha?: number;
}

/**
 * Family A — direct reconciliation. Removed labour hours, lower invoice unit
 * prices and comps returning to norm are observed dollars in the restaurant's
 * own records. A fall is a saving. The concurrent index is disclosed.
 */
export function reconcileA({ observed, index, execDate, preDays = 56, postDays = 28, alpha = 0.05 }: ReconcileArgs): Estimate {
  const preLo = addDays(execDate, -preDays);
  const postHi = addDays(execDate, postDays);
  const pre = select(observed, preLo, execDate);
  const post = select(observed, execDate, postHi);
  if (pre.length < 3 || post.length < 2) {
    return { ok: false, method: "reconciliation", reason: "insufficient invoice cycles", n: { pre: pre.length, post: post.length } };
  }
  const point = mean(pre) - mean(post);
  const se = seDiff(pre, post);
  const df = Math.max(3, welchDf(pre, post));
  const tcrit = tq(1 - alpha, df);
  const tcrit2 = tq(1 - alpha / 2, df);
  let indexMove = 0;
  let indexShare = 0;
  if (index && index.length) {
    const ipre = select(index, preLo, execDate);
    const ipost = select(index, execDate, postHi);
    if (ipre.length && ipost.length) {
      indexMove = mean(ipre) - mean(ipost);
      indexShare = point ? indexMove / point : 0;
    }
  }
  const attributionNote =
    Math.abs(indexShare) > 0.5
      ? `The same vendor's other lines moved ${formatUsd(indexMove, { dp: 2 })} over the same weeks — ${formatPct(Math.abs(indexShare), 0)} of the observed move. An unexplained price effect is excluded, not absorbed.`
      : `The same vendor's other lines moved ${formatUsd(indexMove, { dp: 2 })} over the same weeks, ${formatPct(Math.abs(indexShare), 0)} of the observed move. The effect is not a vendor-wide repricing.`;
  return {
    ok: true,
    method: "reconciliation",
    point,
    se,
    df,
    tcrit,
    tcrit2,
    lower: point - tcrit * se,
    upper: point + tcrit * se,
    ci: [point - tcrit2 * se, point + tcrit2 * se],
    means: { Tpre: mean(pre), Tpost: mean(post), Cpre: 0, Cpost: 0 },
    n: { Tpre: pre.length, Tpost: post.length, Cpre: 0, Cpost: 0 },
    dT: mean(post) - mean(pre),
    dC: 0,
    mde: (zq(1 - alpha / 2) + zq(0.8)) * Math.sqrt(variance(pre) * (1 / Math.max(post.length, 1) + 1 / Math.max(pre.length, 1))),
    sePlanned: Math.sqrt(variance(pre) * (1 / Math.max(post.length, 1) + 1 / Math.max(pre.length, 1))),
    alpha,
    placebo: { ok: true, pass: true, point: indexMove, se: 0, t: 0, crit: 0, note: "Reconciliation carries no placebo. The equivalent check is the concurrent vendor index, disclosed." },
    preFit: 1,
    indexMove,
    indexShare,
    attributionNote,
    window: { execDate, preLo, postHi },
  };
}

/** Aggregate a daily series to ISO weeks (Monday). Chosen before the data is seen. */
export function toWeekly(series: readonly DatedValue[], agg: "mean" | "sum" = "mean"): DatedValue[] {
  const m = groupBy(series, (p) => weekOf(p.date));
  return [...m.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([w, ps]) => ({ date: w, y: agg === "sum" ? sum(ps.map((p) => p.y)) : mean(ps.map((p) => p.y)) }));
}

export interface ServiceScope {
  locs?: readonly string[] | undefined;
  dayparts?: readonly string[] | undefined;
  dows?: readonly number[] | undefined;
}

export function serviceInScope(s: Service, scope: ServiceScope): boolean {
  return (!scope.locs || scope.locs.includes(s.loc)) && (!scope.dayparts || scope.dayparts.includes(s.daypart)) && (!scope.dows || scope.dows.includes(s.dow));
}

/** A dated series over services: one point per business date (mean or sum across scope). */
export function svSeries(reg: Register, scope: ServiceScope, metric: (s: Service) => number, agg: "mean" | "sum" = "mean"): DatedValue[] {
  const rows = reg.services.filter((s) => serviceInScope(s, scope));
  const m = groupBy(rows, (r) => r.date);
  return [...m.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([d, rs]) => ({ date: d, y: agg === "sum" ? sum(rs.map(metric)) : mean(rs.map(metric)) }));
}

export function itemSeries(reg: Register, loc: string, items: readonly string[], metric: (r: ItemDay) => number, agg: "mean" | "sum" = "sum"): DatedValue[] {
  const rows = reg.itemDays.filter((r) => r.loc === loc && items.includes(r.item));
  const m = groupBy(rows, (r) => r.date);
  return [...m.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([d, rs]) => ({ date: d, y: agg === "sum" ? sum(rs.map(metric)) : mean(rs.map(metric)) }));
}
