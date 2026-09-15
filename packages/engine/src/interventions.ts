/**
 * Interventions — System 9. A declared intervention carries the plan that was
 * frozen before execution. Every outcome below is COMPUTED by running the
 * register through the estimator and the verification service; none of the
 * outcomes, intervals or bookable amounts are written down anywhere.
 */
import { addDays, daysBetween, type IsoDate } from "./dates.js";
import { runGuardrails, type GuardrailResult } from "./guardrails.js";
import { did, itemSeries, reconcileA, serviceInScope, svSeries, toWeekly, type DatedValue, type Estimate, type EstimateOk, type ServiceScope } from "./measure.js";
import type { Cents } from "./money.js";
import { decayAt, persistence, type PersistenceResult } from "./persistence.js";
import type { FeedHealth, ItemDay, Register, Service } from "./register.js";
import { groupBy, skuById } from "./register.js";
import type { AutonomyLevel, Lever, MeasurementFamily, VerificationOutcome } from "./registry.js";
import { VERIFICATION_OUTCOMES } from "./registry.js";
import type { InterventionState } from "./states.js";
import { mean, sum } from "./stats.js";
import { verificationService, type DataQualityVerdict, type ExecutionFidelity, type OverlapStatus, type VerificationResult } from "./verify.js";

export type MetricKey = "labour_per_cover" | "comps_per_cover" | "cm_per_cover" | "cogs_per_cover" | "net_per_cover" | "ticket_min" | "item_cost_per_unit" | "sku_unit_price";

export const SERVICE_METRICS: Record<Exclude<MetricKey, "item_cost_per_unit" | "sku_unit_price">, (s: Service) => number> = {
  labour_per_cover: (s) => s.laborCents / Math.max(s.covers, 1),
  comps_per_cover: (s) => s.compsCents / Math.max(s.covers, 1),
  cm_per_cover: (s) => (s.netCents - s.cogsCents) / Math.max(s.covers, 1),
  cogs_per_cover: (s) => s.cogsCents / Math.max(s.covers, 1),
  net_per_cover: (s) => s.netCents / Math.max(s.covers, 1),
  ticket_min: (s) => s.ticketMin,
};

export interface MeasurementPlan {
  primary: string;
  unit: string;
  baselineDays: number;
  windowDays: number;
  minObservations: number;
  preferredObservations: number;
  latencyDays: number;
  comparison: string;
  guardrails: string[];
  rung: number;
  confounders: string[];
  exclusions: string;
  z: string;
  stop: string;
  persistence: string;
}

export interface EvidenceItem {
  type: string;
  detail: string;
  resolved: boolean;
}

export interface Reversal {
  on: IsoDate;
  by: string;
  reason: string;
  creditNote: string;
  foundBy: string;
}

/** A change applied to the synthetic register from execution onwards (fixture only). */
export interface AppliedChange {
  kind: "labour_hours" | "comps_rate" | "sku_price" | "portion" | "price" | "ticket" | "none";
  loc?: string | undefined;
  daypart?: string | undefined;
  dows?: number[] | undefined;
  from: IsoDate;
  /** labour_hours: hours removed per service (spread across roles); comps_rate: absolute rate change; sku_price: multiplier; portion: ratio change; price: new price cents; ticket: minutes. */
  value: number;
  item?: string | undefined;
  sku?: string | undefined;
  roles?: Record<string, number> | undefined;
}

export interface InterventionDecl {
  id: string;
  findingId: string;
  title: string;
  lever: Lever;
  family: MeasurementFamily;
  domain: string;
  loc: string;
  locs: string[];
  daypart: string | null;
  dows?: number[] | undefined;
  account: string;
  autonomy: AutonomyLevel;
  hypothesis: string;
  change: string;
  notChanging: string;
  owner: string;
  approver: string;
  approvalTier: "Operator" | "Owner";
  decidedOn: IsoDate;
  execOn: IsoDate;
  executionFidelity: ExecutionFidelity;
  evidence: EvidenceItem[];
  incrementalCostCents: number;
  recurringCostCents?: number | undefined;
  rung: number;
  plan: MeasurementPlan;
  treatScope?: ServiceScope | undefined;
  controlScope?: ServiceScope | null | undefined;
  treatSku?: string | undefined;
  controlSkus?: string[] | undefined;
  treatItems?: { loc: string; items: string[] } | undefined;
  controlItems?: { loc: string; items: string[] } | undefined;
  metricKey: MetricKey;
  grain: "cover" | "unit" | "sku" | "service";
  direction: "down_is_saving" | "up_is_saving";
  weekly: boolean;
  estimator: "did" | "reconcile";
  /** Projected weekly value at approval (modelled), from the finding's recoverable figure. */
  projectedCents: Cents;
  reversal?: Reversal | undefined;
  appliedChange?: AppliedChange | undefined;
  overlapStatus?: OverlapStatus | undefined;
  overlapDeductionCents?: number | undefined;
  /** Where the lifecycle currently stands before measurement (for user-created ones). */
  lifecycleState?: InterventionState | undefined;
}

export interface HistoryEvent {
  on: IsoDate;
  state: string;
  by: string;
  note: string;
}

export interface ScaledEstimate extends EstimateOk {
  rawPoint: number;
  rawSe: number;
  wkFactor: number;
  wkBasis: string;
  sign: number;
}

export interface InterventionEval extends InterventionDecl {
  state: InterventionState;
  eligibleOn: IsoDate;
  windowClosed: boolean;
  observed: number;
  observedOf: number;
  series: { treatment: DatedValue[]; control: DatedValue[] };
  rawEstimate: Estimate;
  estimate: ScaledEstimate | null;
  guardrailResults: GuardrailResult[];
  dataQuality: DataQualityVerdict;
  result: VerificationResult;
  persistence: PersistenceResult | null;
  persistenceSeries: DatedValue[];
  /** Realized (accrued) cents to date — H2. */
  realizedCents: Cents;
  weeksHeld: number;
  annualRunRateCents: Cents;
  reversedClaimCents: Cents | null;
  weeksBooked: number;
  adjustmentCents: Cents;
  history: HistoryEvent[];
}

const CLOSED_STATE: Partial<Record<VerificationOutcome, InterventionState>> = {
  verified: "verified",
  verified_limited: "verified",
  inconclusive: "inconclusive",
  no_effect: "failed",
  negative: "failed",
  guardrail_failure: "guardrail_failed",
  directional: "failed",
  data_failure: "inconclusive",
  attribution_conflict: "inconclusive",
};

/** The treatment and control series at the grain the plan named. */
export function buildSeries(iv: InterventionDecl, reg: Register): { treatment: DatedValue[]; control: DatedValue[] } {
  let treatment: DatedValue[];
  let control: DatedValue[];
  if (iv.treatSku) {
    // Family A: observed dollars in the restaurant's own invoices; the comparison is the
    // same vendor's other SKUs, indexed to their own pre-period mean.
    const priceSeries = (skus: string[]) => {
      const rows = reg.invoices.filter((r) => skus.includes(r.sku));
      const m = groupBy(rows, (r) => r.week);
      const base: Record<string, number> = {};
      for (const sk of skus) {
        const rs = reg.invoices.filter((r) => r.sku === sk && r.week < iv.execOn);
        base[sk] = mean(rs.map((r) => r.unitPriceCents)) || 1;
      }
      return [...m.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([w, rs]) => ({ date: w, y: mean(rs.map((r) => r.unitPriceCents / (base[r.sku] as number))) * (base[skus[0] as string] as number) }));
    };
    treatment = priceSeries([iv.treatSku]);
    control = priceSeries(iv.controlSkus ?? []);
  } else if (iv.treatItems) {
    const num = (it: { loc: string; items: string[] }) => itemSeries(reg, it.loc, it.items, (r: ItemDay) => r.units * r.costCents);
    const den = (it: { loc: string; items: string[] }) => itemSeries(reg, it.loc, it.items, (r: ItemDay) => r.units);
    const ci = iv.controlItems ?? iv.treatItems;
    if (iv.grain === "unit") {
      const t = num(iv.treatItems);
      const tu = new Map(den(iv.treatItems).map((p) => [p.date, p.y]));
      const c = num(ci);
      const cu = new Map(den(ci).map((p) => [p.date, p.y]));
      treatment = t.map((p) => ({ date: p.date, y: p.y / Math.max(1, tu.get(p.date) ?? 1) }));
      control = c.map((p) => ({ date: p.date, y: p.y / Math.max(1, cu.get(p.date) ?? 1) }));
    } else {
      treatment = num(iv.treatItems);
      control = num(ci);
    }
  } else {
    const metric = SERVICE_METRICS[iv.metricKey as keyof typeof SERVICE_METRICS];
    if (!metric) throw new Error(`metric ${iv.metricKey} needs an item or SKU scope`);
    treatment = svSeries(reg, iv.treatScope ?? { locs: iv.locs }, metric);
    control = iv.controlScope ? svSeries(reg, iv.controlScope, metric) : [];
  }
  if (iv.weekly) {
    treatment = toWeekly(treatment);
    control = toWeekly(control);
  }
  return { treatment, control };
}

export function evaluateIntervention(decl: InterventionDecl, reg: Register, feeds: readonly FeedHealth[], asOf: IsoDate): InterventionEval {
  const iv = decl;
  const postDays = iv.plan.windowDays;
  const preDays = iv.plan.baselineDays;
  const eligibleOn = addDays(iv.execOn, iv.plan.latencyDays + iv.plan.windowDays);
  const executed = iv.executionFidelity === "complete" || iv.executionFidelity === "modified" || iv.executionFidelity === "partial";
  const windowClosed = executed && eligibleOn <= asOf;
  const inScope = (s: Service) => serviceInScope(s, iv.treatScope ?? { locs: iv.locs, dayparts: iv.daypart ? [iv.daypart] : undefined, dows: iv.dows });

  const series = buildSeries(iv, reg);
  const rawEstimate: Estimate =
    iv.estimator === "reconcile"
      ? reconcileA({ observed: series.treatment, index: series.control, execDate: iv.execOn, preDays, postDays })
      : did({ treatment: series.treatment, control: series.control, execDate: iv.execOn, preDays, postDays });

  // Scale the per-unit-of-analysis effect to cents per week, from observed post-window volume.
  const postLo = iv.execOn;
  const postHi = addDays(iv.execOn, postDays);
  const winDays = Math.max(1, Math.min(postDays, daysBetween(postLo, asOf)));
  let wkFactor: number;
  let wkBasis: string;
  if (iv.grain === "cover") {
    const cv = reg.services.filter((s) => inScope(s) && s.date >= postLo && s.date < postHi).reduce((a, s) => a + s.covers, 0);
    wkFactor = (cv / winDays) * 7;
    wkBasis = `${Math.round(wkFactor)} covers/week in the treated scope`;
  } else if (iv.grain === "unit") {
    const ti = iv.treatItems as { loc: string; items: string[] };
    const u = reg.itemDays.filter((r) => r.loc === ti.loc && ti.items.includes(r.item) && r.date >= postLo && r.date < postHi).reduce((a, r) => a + r.units, 0);
    wkFactor = (u / winDays) * 7;
    wkBasis = `${Math.round(wkFactor)} units/week of the treated item`;
  } else if (iv.grain === "sku") {
    const q = reg.invoices.filter((r) => r.sku === iv.treatSku && r.week >= postLo && r.week < postHi).reduce((a, r) => a + r.qty, 0);
    const wks = Math.max(1, Math.round(winDays / 7));
    wkFactor = q / wks;
    wkBasis = `${Math.round(wkFactor)} ${skuById(reg).get(iv.treatSku as string)?.unit ?? "units"}/week purchased across the rooms`;
  } else {
    const n = reg.services.filter((s) => inScope(s) && s.date >= postLo && s.date < postHi).length;
    wkFactor = (n / winDays) * 7;
    wkBasis = `${wkFactor.toFixed(1)} services/week in the treated scope`;
  }
  const sign = iv.estimator === "reconcile" ? 1 : iv.direction === "down_is_saving" ? -1 : 1;
  let estimate: ScaledEstimate | null = null;
  if (rawEstimate.ok) {
    const e = rawEstimate;
    const point = e.point * sign * wkFactor;
    const se = e.se * wkFactor;
    estimate = { ...e, point, se, mde: e.mde * wkFactor, lower: point - e.tcrit * se, upper: point + e.tcrit * se, ci: [point - e.tcrit2 * se, point + e.tcrit2 * se], rawPoint: e.point, rawSe: e.se, wkFactor, wkBasis, sign };
  }

  const guardrailResults = runGuardrails(reg, iv.plan.guardrails, {
    treatScope: iv.treatScope ?? { locs: iv.locs, dayparts: iv.daypart ? [iv.daypart] : undefined, dows: iv.dows },
    controlScope: iv.controlScope ?? null,
    execDate: iv.execOn,
    preDays,
    postDays,
    weekly: iv.weekly,
  });

  const usedFeeds = ["toast_orders", "toast_labour"].concat(iv.lever === "menu_price" || iv.lever === "portion" ? ["recipes"] : []).concat(iv.lever === "ticket_time" ? ["kds"] : []);
  const bad = usedFeeds.map((id) => feeds.find((f) => f.id === id)).filter((f): f is FeedHealth => !!f && f.completeness < 0.9);
  const dataQuality: DataQualityVerdict = {
    pass: !bad.length,
    detail: bad.length ? `${bad.map((b) => b.name).join(", ")} fell below 90% completeness inside the window.` : `All ${usedFeeds.length} contributing feeds stayed above 90% completeness for every day of the window.`,
  };

  let state: InterventionState;
  let result: VerificationResult;
  let observed = 0;
  if (!executed) {
    state = iv.lifecycleState ?? "approved";
    result = { outcome: "pending", label: VERIFICATION_OUTCOMES.pending.label, why: "Not yet executed.", money: null };
  } else if (!windowClosed) {
    state = "measuring";
    result = { outcome: "pending", label: "Measuring", why: "The window is open.", money: null };
    observed = reg.services.filter((s) => inScope(s) && s.date >= iv.execOn && s.date < asOf).length;
  } else {
    result = verificationService(
      { estimate, executionFidelity: iv.executionFidelity, plan: iv.plan, incrementalCostCents: iv.incrementalCostCents, recurringCostCents: iv.recurringCostCents, overlapStatus: iv.overlapStatus ?? "none", overlapDeductionCents: iv.overlapDeductionCents ?? 0 },
      { guardrailResults, dataQuality },
    );
    state = CLOSED_STATE[result.outcome] ?? "closed";
  }

  // Persistence, for the ones that verified: realised weekly effect after the window,
  // re-estimated on a rolling basis.
  let persist: PersistenceResult | null = null;
  const persistenceSeries: DatedValue[] = [];
  if (result.money && estimate) {
    let cur = eligibleOn;
    while (cur <= asOf) {
      const e2 = iv.estimator === "reconcile" ? reconcileA({ observed: series.treatment, index: series.control, execDate: iv.execOn, preDays, postDays: daysBetween(iv.execOn, cur) }) : did({ treatment: series.treatment, control: series.control, execDate: iv.execOn, preDays, postDays: daysBetween(iv.execOn, cur) });
      const v = e2.ok ? Math.max(0, e2.point * sign * wkFactor) : result.money.cents;
      persistenceSeries.push({ date: cur, y: v });
      cur = addDays(cur, 7);
    }
    persist = persistence(persistenceSeries, iv.execOn);
    if (persist.status === "decaying") state = "decayed";
    else if (persist.checks >= 1) state = "persistent";
    else state = "persistence_monitoring";
  }

  // Realised accrual — H2: daily, (weekly ÷ 7) × persistence(t), from eligibility.
  let realizedCents = 0;
  let weeksHeld = 0;
  let annualRunRateCents = 0;
  if (result.money) {
    const weekly = result.money.cents;
    const cls = persist?.cls;
    const hl = persist?.halfLifeWeeks;
    const stopOn = iv.reversal ? (iv.reversal.on < asOf ? iv.reversal.on : asOf) : asOf;
    const days = Math.max(0, daysBetween(eligibleOn, stopOn));
    let acc = 0;
    for (let d = 0; d < days; d++) acc += (weekly / 7) * decayAt(cls, hl, Math.floor(d / 7));
    realizedCents = Math.round(acc);
    weeksHeld = Math.floor(days / 7);
    annualRunRateCents = cls === "structural" || !cls ? weekly * 52 : Math.round(weekly * Math.min(52, (hl ?? 52) * 1.4427));
  }

  let reversedClaimCents: Cents | null = null;
  let weeksBooked = 0;
  let adjustmentCents = 0;
  if (iv.reversal && result.money && iv.reversal.on <= asOf) {
    // A reversal is applied AFTER verification, never instead of it. The original claim,
    // its evidence and its interval all remain on the record; an adjustment sits beside them.
    reversedClaimCents = result.money.cents;
    weeksBooked = Math.max(0, Math.floor(daysBetween(eligibleOn, iv.reversal.on) / 7));
    adjustmentCents = -Math.round(result.money.cents * weeksBooked);
    state = "reversed";
    result = { ...result, outcome: "reversed", label: VERIFICATION_OUTCOMES.reversed.label, why: iv.reversal.reason, money: null, limitation: null };
    realizedCents = 0;
    persist = null;
    annualRunRateCents = 0;
  }

  const history: HistoryEvent[] = [{ on: iv.decidedOn, state: "approved", by: iv.approver, note: `Approved at ${iv.approvalTier} tier. The measurement plan is now frozen.` }];
  if (executed) history.push({ on: iv.execOn, state: "executed", by: iv.owner, note: "Execution evidence resolved against stored register records." });
  if (executed) history.push({ on: windowClosed ? eligibleOn : iv.execOn, state: windowClosed ? "measuring" : "measurement_pending", by: "System", note: windowClosed ? "Measurement window closed; routed to the verification decision service." : "Window accumulating." });
  if (windowClosed) history.push({ on: eligibleOn, state, by: "Verification decision service", note: result.why });
  if (iv.reversal && reversedClaimCents != null) history.push({ on: iv.reversal.on, state: "reversed", by: iv.reversal.by, note: iv.reversal.reason });

  return {
    ...iv,
    state,
    eligibleOn,
    windowClosed,
    observed,
    observedOf: iv.plan.minObservations,
    series,
    rawEstimate,
    estimate,
    guardrailResults,
    dataQuality,
    result,
    persistence: persist,
    persistenceSeries,
    realizedCents,
    weeksHeld,
    annualRunRateCents,
    reversedClaimCents,
    weeksBooked,
    adjustmentCents,
    history,
  };
}

/** Daily realised accrual series for one verified intervention (for the ledger). */
export function accrualSeries(iv: InterventionEval, asOf: IsoDate): DatedValue[] {
  if (!iv.result.money) return [];
  const weekly = iv.result.money.cents;
  const cls = iv.persistence?.cls;
  const hl = iv.persistence?.halfLifeWeeks;
  const stopOn = iv.reversal ? (iv.reversal.on < asOf ? iv.reversal.on : asOf) : asOf;
  const out: DatedValue[] = [];
  const days = Math.max(0, daysBetween(iv.eligibleOn, stopOn));
  for (let d = 0; d < days; d++) out.push({ date: addDays(iv.eligibleOn, d), y: (weekly / 7) * decayAt(cls, hl, Math.floor(d / 7)) });
  return out;
}

export { sum as _sum };
