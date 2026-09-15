/**
 * The ledger — System 6 (fifteen KPIs that may never be added together),
 * System 10 (funnel, twelve conversion metrics), Part III §6 (accrual: day =
 * Σ weekly/7 × persistence, month = sum of days, never × 4.33), System 12
 * (the P&L bridge), I3 (dollars at risk per feed, apportioned).
 *
 * Computed once per (scope, asOf). Every surface reads this; none recomputes.
 */
import { daysBetween, formatDateYear, type IsoDate, monthOf, weekOf } from "./dates.js";
import type { FindingCore, Qualification } from "./detectors.js";
import { accrualSeries, type InterventionEval } from "./interventions.js";
import { type DatedValue } from "./measure.js";
import { type ClaimClass, Money, type Cents } from "./money.js";
import type { FeedHealth, Location } from "./register.js";
import { assertMetricContract, CALC_VERSION, type MetricContract, type ReconStatus, RECON_STATUS } from "./registry.js";
import { FINDING_STATES, type FindingState } from "./states.js";
import { mean, median } from "./stats.js";

export interface LedgerFinding extends FindingCore {
  state: FindingState;
  stateReason?: string | null;
  recoverableCents: Cents;
  qualification: Qualification;
  detectedOn: IsoDate;
  expiresOn: IsoDate;
  historical?: boolean;
  convertedTo?: string | null;
  overlapStatus: "none" | "holds" | "reduced" | "unresolved";
  overlapDeductionCents: number;
  overlapRefs: Array<{ id: string; rule: string; cents: number; role?: string }>;
  overlapNote?: string | null;
  effortHours: number;
  evPerHour: number;
  rejection?: { by: string; on: IsoDate; code: string; reason: string } | null;
}

export interface LedgerAction {
  id: string;
  title: string;
  owner: string;
  dueOn: IsoDate;
  state: "open" | "done" | "not_executed";
  loc: string;
  interventionId: string | null;
  findingId?: string | null;
  next: string;
  evidenceRequired: string;
  tier?: "Owner" | "Operator";
  doneOn?: IsoDate | null;
}

export interface Adjustment {
  id: string;
  kind: "Reversal" | "Decay" | "Dispute";
  interventionId: string;
  title: string;
  loc: string;
  cents: Cents;
  status: "open" | "credited" | "accepted";
  reason: string;
  by: string;
  on: IsoDate;
  originalCents: Cents;
  weeks?: number;
  note?: string;
  foundBy?: string;
}

export interface LedgerSide {
  status: ReconStatus;
  observedCents: Cents;
  timingCents: Cents;
  unexplainedCents: Cents;
  explanation: string;
  reviewer: string;
  periodLabel: string;
  quantityEffect: string;
  rateEffect: string;
  mixEffect: string;
}

export interface Period {
  from: IsoDate;
  to: IsoDate;
  label: string;
  fiscal: string;
}

export interface LedgerInput {
  findings: LedgerFinding[];
  interventions: InterventionEval[];
  actions: LedgerAction[];
  adjustments: Adjustment[];
  feeds: FeedHealth[];
  locations: Location[];
  /** 'all' or a location id. */
  scope: string;
  feeMonthlyCents: Cents;
  asOf: IsoDate;
  period: Period;
  ledgerSides?: Record<string, LedgerSide>;
}

export interface Kpi {
  id: string;
  label: string;
  value: Money | number;
  klass: "Estimated" | "Modelled" | "Causal" | "Bookable" | "—";
  definition: string;
  drillTo: string;
  read: string;
  hero?: boolean;
  isRatio?: boolean;
  isCount?: boolean;
  isPct?: boolean;
  neverTotal?: boolean;
  contract: MetricContract;
}

const sumBy = <T>(arr: readonly T[], fn: (x: T) => number) => arr.reduce((a, x) => a + fn(x), 0);

export function scopeLocs(input: Pick<LedgerInput, "locations" | "scope">): string[] {
  return input.scope === "all" ? input.locations.map((l) => l.id) : [input.scope];
}
export function inScope(x: { locs?: string[]; loc?: string }, locs: readonly string[]): boolean {
  const ls = x.locs ?? (x.loc ? [x.loc] : []);
  return ls.some((l) => locs.includes(l)) || x.loc === "group";
}

/** Money in the period: the daily accrual restricted to the period. */
export function accrualInPeriod(iv: InterventionEval, period: Period, asOf: IsoDate): Cents {
  return Math.round(accrualSeries(iv, asOf).filter((p) => p.date >= period.from && p.date <= period.to).reduce((a, p) => a + p.y, 0));
}

function contractFor(input: LedgerInput, id: string, definition: string, klass: Kpi["klass"], drillTo: string, statusNote?: string): MetricContract {
  const pilot = input.feeds.filter((f) => f.tier === "Pilot");
  const loc = input.scope === "all" ? `All ${input.locations.length} rooms. None excluded.` : `${input.locations.find((l) => l.id === input.scope)?.name ?? input.scope} only. The other rooms are excluded by the scope selector, not by a data gap.`;
  const orders = input.feeds.find((f) => f.id === "toast_orders");
  return assertMetricContract(id, {
    definition,
    dateRange: `${formatDateYear(input.period.from)} – ${formatDateYear(input.period.to)} · ${input.period.fiscal}`,
    locationScope: loc,
    status: statusNote ?? (klass === "Bookable" ? "Counts verified, persistent and reconciled claims only." : klass === "Estimated" ? "Counts open and qualified findings; terminal states excluded." : "Counts interventions inside an open measurement window."),
    confidence: klass,
    freshness: `Newest contributing business date ${formatDateYear(orders?.newest ?? input.asOf)}.`,
    lineage: pilot.map((f) => f.name).join(" · ") || "Register",
    drillTo,
    changeExplanation: "Period-over-period comparison is available once a second closed period exists.",
    calcVersion: CALC_VERSION,
  });
}

export function kpis(input: LedgerInput): Kpi[] {
  const locs = scopeLocs(input);
  const fs = input.findings.filter((f) => inScope(f, locs));
  const open = fs.filter((f) => !FINDING_STATES[f.state].terminal && f.state !== "converted");
  const qualified = fs.filter((f) => ["awaiting_decision", "accepted", "converted"].includes(f.state) && !f.historical);
  const ivs = input.interventions.filter((iv) => inScope(iv, locs));
  const verified = ivs.filter((iv) => iv.result.money);
  const persistent = verified.filter((iv) => iv.persistence && iv.persistence.status !== "decaying");
  const inFlight = ivs.filter((iv) => iv.state === "measuring" || iv.state === "measurement_pending" || iv.state === "executed");
  const approvedNotStarted = ivs.filter((iv) => ["approved", "scheduled", "in_progress", "evidence_pending"].includes(iv.state));
  const feePeriod = Math.round(input.feeMonthlyCents * (input.scope === "all" ? 1 : 1 / Math.max(input.locations.length, 1)));

  const exposure = sumBy(open, (f) => f.exposureCents);
  const recoverable = sumBy(qualified, (f) => f.recoverableCents);
  const approvedValue = sumBy(approvedNotStarted, (iv) => iv.projectedCents);
  const activeValue = sumBy(inFlight, (iv) => iv.projectedCents);
  const measured = sumBy(ivs.filter((iv) => iv.estimate && iv.windowClosed), (iv) => Math.max(0, Math.round(iv.estimate?.point ?? 0)));
  const verifiedWeekly = sumBy(verified, (iv) => iv.result.money?.cents ?? 0);
  const persistentInPeriod = sumBy(persistent, (iv) => accrualInPeriod(iv, input.period, input.asOf));
  const realized = sumBy(verified, (iv) => iv.realizedCents);
  const adjustmentsInScope = input.adjustments.filter((a) => a.status !== "open" && (input.scope === "all" || a.loc === input.scope || a.loc === "group"));
  const adjustments = -sumBy(adjustmentsInScope, (a) => a.cents);
  const runRate = sumBy(persistent, (iv) => iv.annualRunRateCents);
  const multiple = feePeriod ? persistentInPeriod / feePeriod : 0;
  const dq = mean(input.feeds.filter((f) => f.tier === "Pilot").map((f) => f.completeness));
  const reconciled = verified.filter((iv) => input.ledgerSides?.[iv.id]?.status === "reconciled");
  const reconciledCents = sumBy(reconciled, (iv) => input.ledgerSides?.[iv.id]?.observedCents ?? 0);

  const K = (id: string, label: string, value: Money | number, klass: Kpi["klass"], definition: string, drillTo: string, read: string, extra: Partial<Kpi> = {}): Kpi => ({
    id,
    label,
    value,
    klass,
    definition,
    drillTo,
    read,
    contract: contractFor(input, id, definition, klass, drillTo),
    ...extra,
  });

  return [
    K("persistent", "Persistent verified savings", new Money(persistentInPeriod, "bookable"), "Bookable", "Verified claims that passed their most recent persistence check, accrued over the days of this period they held.", "persistence cohorts", "The only basis for annualisation. The number a customer can check.", { hero: true }),
    K("multiple", "Verified value multiple", multiple, "Bookable", "Persistent verified savings ÷ recurring fees for the same period.", "fee comparison", "The renewal number. Below 3× the product is not obviously worth buying.", { isRatio: true, hero: true }),
    K("verified", "Verified savings, weekly rate", new Money(verifiedWeekly, "verified"), "Bookable", "Sum of bookable weekly claims whose windows closed clean.", "savings ledger", "Lower bound, gates passed, overlap resolved."),
    K("realized", "Realized savings, to date", new Money(realized, "realized"), "Bookable", "Bookable value accrued over the days each result actually held.", "savings ledger", "Banked. The only class allowed that word."),
    K("runrate", "Verified annualised run rate", new Money(runRate, "bookable"), "Bookable", "Persistent verified weekly savings × 52, decayed by persistence class.", "run-rate derivation", "A run rate, not realised annual savings. The label is part of the metric."),
    K("adjustments", "Reversed or expired", new Money(-adjustments, "adjustment"), "—", "Negative adjustments in the period.", "adjustments register", "Shown next to verified savings, never netted into it silently."),
    K("reconciledValue", "Reconciled savings", new Money(reconciledCents, "bookable"), "Bookable", "Verified savings connected to the ledger through an explainable bridge.", "reconciliation register", "The strictest basis for a fee. A claim the books do not support does not bill."),
    K("recon", "Financial reconciliation status", verified.length ? reconciled.length / verified.length : 0, "Bookable", "Share of verified claims reconciled.", "reconciliation register", "The accountant's view of whether any of this is real.", { isPct: true }),
    K("measured", "Measured improvement", new Money(measured, "measured"), "Causal", "Point estimates from closed measurement windows, before gates.", "measurement queue", "Observed, not yet attributed or gated."),
    K("active", "Active intervention value", new Money(activeValue, "committed"), "Modelled", "Projected value of interventions currently executing or measuring.", "active interventions", "Work in flight. Never added to verified savings."),
    K("approved", "Approved test value", new Money(approvedValue, "committed"), "Modelled", "Projected value of interventions approved but not yet executed.", "approved interventions", "Measures commitment, not results."),
    K("recoverable", "Qualified recoverable opportunity", new Money(recoverable, "recoverable"), "Estimated", "Exposure that passed data, feasibility and overlap tests, deduplicated.", "qualification queue", "The honest top of the funnel. The number a pipeline conversation should use."),
    K("exposure", "Total profit exposure", new Money(exposure, "profit_exposure"), "Estimated", "Sum of open, non-duplicated exposure estimates.", "exposure by domain", "Rises when detection improves. A falling number is not necessarily good news.", { neverTotal: true }),
    K("openf", "Open findings", open.length, "—", "Count by state and age.", "findings list", "Ageing matters more than volume.", { isCount: true }),
    K("overdue", "Overdue actions", input.actions.filter((a) => a.state === "open" && a.dueOn < input.asOf && (input.scope === "all" || a.loc === input.scope || a.loc === "group")).length, "—", "Count of actions past their due date by owner.", "action list", "The earliest leading indicator of churn.", { isCount: true }),
    K("dq", "Data confidence", dq, "—", "Composite of source freshness, completeness and mapping health.", "data-quality register", "When this falls, every number above it inherits the fall.", { isPct: true }),
  ];
}

export interface FunnelStage {
  stage: string;
  n: number;
  cents: Cents;
  klass: ClaimClass | null;
  lost: string | null;
}

export function funnel(input: LedgerInput): FunnelStage[] {
  const locs = scopeLocs(input);
  const fs = input.findings.filter((f) => inScope(f, locs));
  const ivs = input.interventions.filter((iv) => inScope(iv, locs));
  const detected = fs;
  const qualified = fs.filter((f) => f.qualification.pass);
  const acceptedIds = new Set([...fs.filter((f) => ["accepted", "converted"].includes(f.state)).map((f) => f.id), ...ivs.map((iv) => iv.findingId)]);
  const accepted = fs.filter((f) => acceptedIds.has(f.id));
  const executed = ivs.filter((iv) => ["complete", "modified", "partial"].includes(iv.executionFidelity) && iv.windowClosed !== undefined && iv.state !== "approved" && iv.state !== "scheduled");
  const measured = ivs.filter((iv) => iv.windowClosed && iv.estimate);
  const verified = ivs.filter((iv) => iv.result.money || iv.reversedClaimCents != null);
  const persistent = verified.filter((iv) => iv.persistence && iv.persistence.status !== "decaying");
  const reconciled = verified.filter((iv) => input.ledgerSides?.[iv.id]?.status === "reconciled");
  const byOutcome = (o: string) => ivs.filter((iv) => iv.result.outcome === o).length;
  return [
    { stage: "Detected", n: detected.length, cents: sumBy(detected, (f) => f.exposureCents), klass: "profit_exposure", lost: null },
    { stage: "Qualified", n: qualified.length, cents: sumBy(qualified, (f) => f.recoverableCents), klass: "recoverable", lost: `${detected.length - qualified.length} lost — data insufficient or below the recoverability floor` },
    { stage: "Accepted", n: accepted.length, cents: sumBy(accepted, (f) => f.recoverableCents), klass: "recoverable", lost: `${qualified.length - accepted.length} awaiting a decision or rejected by the operator` },
    { stage: "Executed", n: executed.length, cents: sumBy(executed, (iv) => iv.projectedCents), klass: "committed", lost: `${accepted.length - executed.length} accepted but not yet executed` },
    { stage: "Measured", n: measured.length, cents: sumBy(measured, (iv) => Math.max(0, Math.round(iv.estimate?.point ?? 0))), klass: "measured", lost: `${executed.length - measured.length} still inside the window` },
    { stage: "Verified", n: verified.length, cents: sumBy(verified, (iv) => iv.result.money?.cents ?? iv.reversedClaimCents ?? 0), klass: "verified", lost: `${measured.length - verified.length} did not clear the gates — ${byOutcome("guardrail_failure")} guardrail failure, ${byOutcome("no_effect")} no measurable effect, ${byOutcome("inconclusive")} inconclusive` },
    { stage: "Persistent", n: persistent.length, cents: sumBy(persistent, (iv) => iv.result.money?.cents ?? 0), klass: "bookable", lost: `${verified.length - persistent.length} below the persistence threshold or reversed` },
    { stage: "Reconciled", n: reconciled.length, cents: sumBy(reconciled, (iv) => input.ledgerSides?.[iv.id]?.observedCents ?? 0), klass: "bookable", lost: `${verified.length - reconciled.length} partially reconciled, awaiting the close, or withdrawn` },
  ];
}

export interface ConversionMetric {
  id: string;
  label: string;
  def: string;
  measures: string;
  target: number | [number, number] | null;
  dir: "gte" | "band" | "lte_days" | "gte_x" | "none";
  bad: string;
  value: number | null;
  ok: boolean | null;
}

const CONVERSIONS: Array<Omit<ConversionMetric, "value" | "ok">> = [
  { id: "qual", label: "Findings qualified rate", def: "qualified ÷ detected", measures: "Detector precision and data sufficiency", target: 0.5, dir: "gte", bad: "A low rate means detectors are firing on noise." },
  { id: "accept", label: "Finding acceptance rate", def: "accepted ÷ presented", measures: "Whether recommendations are operationally sensible", target: 0.6, dir: "gte", bad: "The clearest signal of product-market fit inside an account." },
  { id: "exec", label: "Accepted-to-executed rate", def: "executed ÷ accepted", measures: "Whether the organisation can actually change", target: 0.7, dir: "gte", bad: "Below this, the problem is adoption, not detection." },
  { id: "evid", label: "Execution evidence completion", def: "evidence resolved ÷ executed", measures: "Whether proof exists that the change happened", target: 0.9, dir: "gte", bad: "Anything lower makes measurement meaningless." },
  { id: "meas", label: "Executed-to-measurable rate", def: "reached a conclusion ÷ executed", measures: "Whether the measurement design is realistic", target: 0.8, dir: "gte", bad: "Chronic inconclusiveness means windows or controls are wrong." },
  { id: "ver", label: "Measurable-to-verified rate", def: "verified ÷ measured", measures: "How often a real effect survives the gates", target: [0.3, 0.6], dir: "band", bad: "Above 80% suggests the gates are too loose." },
  { id: "guard", label: "Guardrail pass rate", def: "no breach ÷ measured", measures: "Whether savings are costing something else", target: 0.9, dir: "gte", bad: "A low rate is a recommendation-quality problem." },
  { id: "pers", label: "Persistence at 90 days", def: "still holding ÷ verified", measures: "Whether improvements survive", target: 0.7, dir: "gte", bad: "The number that separates recovery from a temporary push." },
  { id: "t2a", label: "Median time to first action", def: "detection → first action", measures: "Speed of the front half of the loop", target: 5, dir: "lte_days", bad: "Slow here usually means the finding was unclear." },
  { id: "t2v", label: "Median time to verified savings", def: "detection → verified", measures: "Speed of the whole loop", target: 45, dir: "lte_days", bad: "The cash-conversion cycle of the product." },
  { id: "vpl", label: "Verified value per location", def: "persistent verified ÷ locations", measures: "Whether value scales with footprint", target: null, dir: "none", bad: "Compare across cohorts, never across periods of different length." },
  { id: "mult", label: "Verified value multiple", def: "persistent verified ÷ fees", measures: "Whether the customer should renew", target: 3, dir: "gte_x", bad: "The only ROI number that survives an accountant." },
];

export function conversions(input: LedgerInput): ConversionMetric[] {
  const locs = scopeLocs(input);
  const fs = input.findings.filter((f) => inScope(f, locs));
  const ivs = input.interventions.filter((iv) => inScope(iv, locs));
  const qualified = fs.filter((f) => f.qualification.pass);
  const presented = fs.filter((f) => ["awaiting_decision", "accepted", "rejected", "converted"].includes(f.state));
  const accepted = fs.filter((f) => ["accepted", "converted"].includes(f.state));
  const executed = ivs.filter((iv) => ["complete", "modified", "partial"].includes(iv.executionFidelity) && !["approved", "scheduled"].includes(iv.state));
  const measured = ivs.filter((iv) => iv.windowClosed && iv.estimate);
  const verified = ivs.filter((iv) => iv.result.money || iv.reversedClaimCents != null);
  const persistent = verified.filter((iv) => iv.persistence && iv.persistence.status !== "decaying");
  const fee = input.feeMonthlyCents * (input.scope === "all" ? 1 : 1 / Math.max(input.locations.length, 1));
  const persistentInPeriod = sumBy(persistent, (iv) => accrualInPeriod(iv, input.period, input.asOf));
  const firstActionDays = ivs.map((iv) => {
    const f = fs.find((x) => x.id === iv.findingId);
    return f ? daysBetween(f.detectedOn, iv.decidedOn) : null;
  }).filter((d): d is number => d != null && d >= 0);
  const v: Record<string, number | null> = {
    qual: fs.length ? qualified.length / fs.length : null,
    accept: presented.length ? accepted.length / presented.length : null,
    exec: accepted.length ? Math.min(1, executed.length / accepted.length) : null,
    evid: executed.length ? executed.filter((iv) => iv.evidence.every((e) => e.resolved)).length / executed.length : null,
    meas: executed.length ? measured.length / executed.length : null,
    ver: measured.length ? verified.length / measured.length : null,
    guard: measured.length ? measured.filter((iv) => iv.guardrailResults.every((g) => g.passed)).length / measured.length : null,
    pers: verified.length ? persistent.length / verified.length : null,
    t2a: firstActionDays.length ? median(firstActionDays) : null,
    t2v: verified.length ? median(verified.map((iv) => daysBetween(iv.decidedOn, iv.eligibleOn))) : null,
    vpl: persistent.length ? persistentInPeriod / locs.length : null,
    mult: fee ? persistentInPeriod / fee : null,
  };
  return CONVERSIONS.map((c) => {
    const value = v[c.id] ?? null;
    let ok: boolean | null = null;
    if (value != null) {
      if (c.dir === "gte") ok = value >= (c.target as number);
      else if (c.dir === "band") ok = value >= (c.target as [number, number])[0] && value <= (c.target as [number, number])[1];
      else if (c.dir === "lte_days") ok = value <= (c.target as number);
      else if (c.dir === "gte_x") ok = value >= (c.target as number);
    }
    return { ...c, value, ok };
  });
}

/* ---------- accrual (Part III §6) ----------------------------------------- */

export interface Accrual {
  daily: DatedValue[];
  byWeek: Array<{ week: IsoDate; cents: Cents }>;
  byMonth: Array<{ month: string; cents: Cents; adjustmentsCents: Cents; feeCents: Cents }>;
  todayCents: Cents;
  weekCents: Cents;
  monthCents: Cents;
  cumulative: DatedValue[];
}

export function accrual(input: LedgerInput): Accrual {
  const locs = scopeLocs(input);
  const ivs = input.interventions.filter((iv) => inScope(iv, locs) && iv.result.money);
  const daily = new Map<IsoDate, number>();
  for (const iv of ivs) for (const p of accrualSeries(iv, input.asOf)) daily.set(p.date, (daily.get(p.date) ?? 0) + p.y);
  const days = [...daily.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, y]) => ({ date, y }));
  const byWeekMap = new Map<IsoDate, number>();
  const byMonthMap = new Map<string, number>();
  for (const p of days) {
    byWeekMap.set(weekOf(p.date), (byWeekMap.get(weekOf(p.date)) ?? 0) + p.y);
    byMonthMap.set(monthOf(p.date), (byMonthMap.get(monthOf(p.date)) ?? 0) + p.y);
  }
  const adjInScope = input.adjustments.filter((a) => a.status !== "open" && (input.scope === "all" || a.loc === input.scope || a.loc === "group"));
  const months = [...byMonthMap.keys()].sort();
  const byMonth = months.map((month) => ({
    month,
    cents: Math.round(byMonthMap.get(month) ?? 0),
    adjustmentsCents: Math.round(sumBy(adjInScope.filter((a) => monthOf(a.on) === month), (a) => a.cents)),
    feeCents: Math.round(input.feeMonthlyCents * (input.scope === "all" ? 1 : 1 / Math.max(input.locations.length, 1))),
  }));
  let run = 0;
  const cumulative = days.map((p) => ({ date: p.date, y: (run += p.y) }));
  const lastDay = days[days.length - 1];
  const thisWeek = weekOf(input.asOf);
  return {
    daily: days.map((p) => ({ date: p.date, y: Math.round(p.y) })),
    byWeek: [...byWeekMap.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([week, c]) => ({ week, cents: Math.round(c) })),
    byMonth,
    todayCents: lastDay && lastDay.date >= input.asOf ? Math.round(lastDay.y) : Math.round(daily.get(input.asOf) ?? 0),
    weekCents: Math.round(byWeekMap.get(thisWeek) ?? 0),
    monthCents: Math.round(byMonthMap.get(monthOf(input.asOf)) ?? 0),
    cumulative: cumulative.map((p) => ({ date: p.date, y: Math.round(p.y) })),
  };
}

/* ---------- dollars at risk per feed (I3) ---------------------------------- */

export interface FeedRisk {
  feedId: string;
  openExposureCents: Cents;
  monitoringCents: Cents;
  verifiedAtRiskCents: Cents;
  blockedCents: Cents;
}

export function feedRisk(input: LedgerInput): FeedRisk[] {
  const locs = scopeLocs(input);
  const fs = input.findings.filter((f) => inScope(f, locs) && !f.historical);
  const ivs = input.interventions.filter((iv) => inScope(iv, locs));
  return input.feeds.map((feed) => {
    let openExposure = 0;
    let blocked = 0;
    for (const f of fs) {
      if (!f.feeds.includes(feed.id)) continue;
      const share = f.recoverableCents / Math.max(f.feeds.length, 1); // apportioned, never repeated
      if (f.state === "data_insufficient") blocked += f.exposureCents / Math.max(f.feeds.length, 1);
      else if (!FINDING_STATES[f.state].terminal && f.state !== "converted") openExposure += share;
    }
    let monitoring = 0;
    let verifiedAtRisk = 0;
    for (const iv of ivs) {
      const used = ["toast_orders", "toast_labour"].concat(iv.lever === "menu_price" || iv.lever === "portion" ? ["recipes"] : []).concat(iv.lever === "ticket_time" ? ["kds"] : []);
      if (!used.includes(feed.id)) continue;
      if (iv.state === "measuring") monitoring += iv.projectedCents / used.length;
      if (iv.result.money) verifiedAtRisk += iv.result.money.cents / used.length;
    }
    return { feedId: feed.id, openExposureCents: Math.round(openExposure), monitoringCents: Math.round(monitoring), verifiedAtRiskCents: Math.round(verifiedAtRisk), blockedCents: Math.round(blocked) };
  });
}

/* ---------- the P&L bridge (System 12) ------------------------------------- */

export interface BridgeLine {
  k: string;
  v: string;
}
export interface Bridge {
  claimCents: Cents;
  account: string;
  status: ReconStatus;
  statusLabel: string;
  observedCents: Cents;
  timingCents: Cents;
  unexplainedCents: Cents;
  reconciledCents: Cents;
  lines: BridgeLine[];
}

import { formatPct, formatUsd } from "./money.js";

export function bridge(iv: InterventionEval, claimCents: Cents, side: LedgerSide): Bridge {
  const acct = iv.account;
  const lines: BridgeLine[] = [
    { k: "Operational driver changed", v: iv.change },
    { k: "Quantity effect", v: side.quantityEffect },
    { k: "Rate or price effect", v: side.rateEffect },
    { k: "Mix effect", v: side.mixEffect },
    { k: "Timing effect", v: side.timingCents ? `Pay-period boundary splits the window; ${formatUsd(side.timingCents)} lands in the following period` : "None — the window closes inside one accounting period" },
    { k: "Expected P&L account", v: acct },
    { k: "Expected recognition period", v: side.periodLabel },
    { k: "Observed ledger movement", v: `${acct.split(" · ")[0]} moved ${formatUsd(side.observedCents)} against the modelled counterfactual` },
    { k: "Reconciliation variance", v: `${formatUsd(side.unexplainedCents)} unexplained, ${formatPct(claimCents ? side.unexplainedCents / claimCents : 0, 1)} of the claim` },
    { k: "Explanation", v: side.explanation },
    { k: "Accountant review", v: side.status === "partial" || side.status === "unexplained" ? `Open with ${side.reviewer}` : `Reviewed and accepted by ${side.reviewer}` },
    { k: "Reconciliation status", v: RECON_STATUS[side.status].label },
  ];
  return { claimCents, account: acct, status: side.status, statusLabel: RECON_STATUS[side.status].label, observedCents: side.observedCents, timingCents: side.timingCents, unexplainedCents: side.unexplainedCents, reconciledCents: side.status === "reconciled" || side.status === "timing" ? side.observedCents : 0, lines };
}
