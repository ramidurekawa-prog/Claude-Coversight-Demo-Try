/**
 * The Rosewood build: one deterministic function of (asOf, seed, applied
 * changes) that assembles everything the database seeds and the nightly job
 * recomputes. Nothing financial is written down here — every finding comes
 * out of the detectors, every outcome out of the verification service, every
 * adjustment out of an evaluated intervention.
 */
import type { Adjustment, AppliedChange, FeedHealth, InterventionDecl, InterventionEval, LedgerAction, LedgerFinding, LedgerSide, Period, PriorFinding, Register } from "@streamline/engine";
import { accrualInPeriod, addDays, daysBetween, deriveAdjustments, evaluateIntervention, expireStale, feedHealth, formatMonthLong, monthOf, numberAdjustments, recoverableOf, rollupRegister, runDetectionPass, type UnnumberedAdjustment } from "@streamline/engine";
import { buildFeeds, generateCanonical, type RosewoodCanonical } from "./generate";
import { ACTIONS, DISPUTE_ON, DISPUTE_TEMPLATE, HISTORICAL_FINDINGS, INTERVENTIONS, INVESTIGATIONS, REJECTED_FINDING, ledgerSideFor } from "./history";
import { FIXTURE, LOCATIONS, ORG } from "./spec";

export interface BuildOptions {
  /** The demo clock. Default: the fixture's own "today". */
  asOf?: string;
  /** Changes executed inside the product (user-created interventions), applied to the register from their date. */
  appliedChanges?: AppliedChange[];
  /** Interventions created inside the product, evaluated alongside the declared history. */
  userInterventions?: InterventionDecl[];
  /** Lifecycle state already recorded for findings (decisions survive re-detection). */
  priorFindings?: ReadonlyMap<string, PriorFinding>;
  /** Actions created inside the product. */
  userActions?: LedgerAction[];
  /** Adjustments already on the record — ids are kept, never renumbered. */
  priorAdjustments?: Adjustment[];
}

export interface RosewoodBuild {
  org: typeof ORG;
  fixture: typeof FIXTURE;
  asOf: string;
  canonical: RosewoodCanonical;
  register: Register;
  feeds: FeedHealth[];
  findings: LedgerFinding[];
  /** Ids the detectors fired on this pass (live findings; historical ones are records). */
  fired: string[];
  interventions: InterventionEval[];
  actions: LedgerAction[];
  adjustments: Adjustment[];
  ledgerSides: Record<string, LedgerSide>;
  /** The open period the ledger reports on (month to date). */
  period: Period;
  /** The last closed accounting period — what the bridge reconciles against. */
  closedPeriod: Period;
}

/** The open period: the month to date, through the last COMPLETE business date. */
export function periodFor(asOf: string): Period {
  const last = addDays(asOf, -1);
  const m = monthOf(last);
  return { from: `${m}-01`, to: last, label: `${formatMonthLong(m)}, month to date`, fiscal: `FY${last.slice(0, 4)} P${Number(m.slice(5, 7))}` };
}

export function closedPeriodFor(asOf: string): Period {
  const prevLast = addDays(`${monthOf(asOf)}-01`, -1);
  const m = monthOf(prevLast);
  return { from: `${m}-01`, to: prevLast, label: formatMonthLong(m), fiscal: `FY${m.slice(0, 4)} P${Number(m.slice(5, 7))}` };
}

/** A historical finding is a record of what was on the register when it converted: it does not re-run. */
function historicalFinding(h: (typeof HISTORICAL_FINDINGS)[number], iv: InterventionDecl): LedgerFinding {
  const recoverableCents = recoverableOf({ exposureCents: h.exposureCents, lever: h.lever });
  return {
    id: h.id,
    detector: `D-${h.lever}`,
    detectorCode: h.id.split("-")[1] ?? "HIST",
    domain: h.domain,
    lever: h.lever,
    family: h.family,
    loc: h.loc,
    locs: h.loc === "group" ? LOCATIONS.map((l) => l.id) : [h.loc],
    daypart: h.daypart,
    dow: null,
    scopeKey: h.scopeKey,
    account: h.account,
    equations: [],
    feeds: ["toast_orders"],
    title: h.title,
    plain: iv.hypothesis,
    onset: null,
    observed: { metric: iv.plan.primary, actual: 0, baseline: 0, unit: "", periodLabel: "At detection" },
    exposureCents: h.exposureCents,
    series: [],
    chartBaselineN: null,
    evidenceCount: 0,
    cadenceDays: 7,
    causes: [],
    remedy: { change: iv.change, alternatives: [], effort: 2, risk: "low", latencyDays: iv.plan.latencyDays, artifact: iv.evidence[0]?.type ?? "" },
    guardrails: iv.plan.guardrails,
    contraindications: [],
    autonomy: iv.autonomy,
    state: "converted",
    stateReason: `Converted to ${iv.id} on ${iv.decidedOn}.`,
    recoverableCents,
    qualification: { pass: true, tests: [], completeness: 1, staleFeeds: [] },
    detectedOn: h.detectedOn,
    decisionOpenedOn: h.detectedOn,
    expiresOn: addDays(h.detectedOn, 45),
    historical: true,
    convertedTo: iv.id,
    overlapStatus: "none",
    overlapDeductionCents: 0,
    overlapRefs: [],
    overlapNote: null,
    effortHours: 2,
    evPerHour: 0,
    rejection: null,
  };
}

export function buildRosewood(opts: BuildOptions = {}): RosewoodBuild {
  const asOf = opts.asOf ?? ORG.asOf;
  const through = addDays(asOf, -1);
  const canonical = generateCanonical({ through, appliedChanges: opts.appliedChanges ?? [] });
  const register = rollupRegister(canonical);
  const feeds = buildFeeds(canonical, asOf).map((f) => feedHealth(f, asOf, daysBetween));

  // Prior lifecycle state: the historical conversions, the live conversion, the rejection, then whatever the product recorded.
  const prior = new Map<string, PriorFinding>();
  const liveConversions = INTERVENTIONS.filter((iv) => iv.findingId.startsWith("F-"));
  for (const iv of liveConversions) if (iv.decidedOn <= asOf) prior.set(iv.findingId, { state: "converted", stateReason: `Converted to ${iv.id} on ${iv.decidedOn}.`, convertedTo: iv.id });
  for (const inv of INVESTIGATIONS) if (inv.on <= asOf) prior.set(inv.id, { state: "investigating", stateReason: `${inv.by}, ${inv.on}: ${inv.reason}` });
  if (REJECTED_FINDING.on <= asOf) prior.set(REJECTED_FINDING.id, { state: "rejected", stateReason: REJECTED_FINDING.reason, rejection: { by: REJECTED_FINDING.by, on: REJECTED_FINDING.on, code: REJECTED_FINDING.code, reason: REJECTED_FINDING.reason } });
  for (const [id, p] of opts.priorFindings ?? []) prior.set(id, p);

  const pass = runDetectionPass(register, feeds, asOf, prior);
  const live = expireStale(pass.findings, asOf);

  // Declared history: projected value is recomputed from the recorded exposure through the same
  // recovery factor the live findings use, so the number is never typed twice.
  const declared = INTERVENTIONS.filter((iv) => iv.decidedOn <= asOf).map((iv) => {
    const h = HISTORICAL_FINDINGS.find((x) => x.id === iv.findingId);
    const liveF = live.find((f) => f.id === iv.findingId);
    const projectedCents = h ? recoverableOf({ exposureCents: h.exposureCents, lever: h.lever }) : (liveF?.recoverableCents ?? iv.projectedCents);
    return { ...iv, projectedCents };
  });
  const historical = HISTORICAL_FINDINGS.filter((h) => h.detectedOn <= asOf).map((h) => historicalFinding(h, declared.find((iv) => iv.findingId === h.id) ?? (INTERVENTIONS.find((iv) => iv.findingId === h.id) as InterventionDecl)));

  const interventions = [...declared, ...(opts.userInterventions ?? [])].map((iv) => evaluateIntervention(iv, register, feeds, asOf));

  // Adjustments come OUT of evaluated interventions — reversal, decay — never in; the
  // controller's dispute is the one declared entry, and it attaches to a computed bridge.
  const unnumbered: UnnumberedAdjustment[] = deriveAdjustments(interventions, asOf);

  // Ledger sides for the last closed month, and the one dispute the controller raised.
  const closedPeriod = closedPeriodFor(asOf);
  const ledgerSides: Record<string, LedgerSide> = {};
  const claims: Record<string, number> = {};
  for (const iv of interventions) {
    if (!iv.result.money) continue;
    const claimCents = accrualInPeriod(iv, closedPeriod, asOf);
    if (claimCents <= 0) continue;
    const side = ledgerSideFor(iv, claimCents);
    if (!side) continue;
    ledgerSides[iv.id] = side;
    claims[iv.id] = claimCents;
  }
  // The controller's one open dispute sits on the bridge with the largest unexplained line.
  const disputed = Object.entries(ledgerSides).sort((a, b) => b[1].unexplainedCents - a[1].unexplainedCents)[0];
  if (disputed && disputed[1].unexplainedCents > 0 && DISPUTE_ON <= asOf) {
    const iv = interventions.find((x) => x.id === disputed[0]) as InterventionEval;
    unnumbered.push(DISPUTE_TEMPLATE(iv, disputed[1], claims[iv.id] ?? 0, closedPeriod.label));
  }
  const adjustments: Adjustment[] = numberAdjustments(opts.priorAdjustments ?? [], unnumbered);

  const actions = [...ACTIONS, ...(opts.userActions ?? [])];

  return {
    org: ORG,
    fixture: FIXTURE,
    asOf,
    canonical,
    register,
    feeds,
    findings: [...historical, ...live],
    fired: pass.fired,
    interventions,
    actions,
    adjustments,
    ledgerSides,
    period: periodFor(asOf),
    closedPeriod,
  };
}
