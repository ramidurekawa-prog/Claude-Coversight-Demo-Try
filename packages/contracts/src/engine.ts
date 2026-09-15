/**
 * Wire schemas for the records the engine produces. Each schema mirrors the
 * engine interface of the same name field for field (packages/engine/src/*):
 * `?:` → `.optional()`, `| null` → `.nullable()`, `?: T | null` → `.nullish()`.
 * Nothing here computes; it only describes what crosses the API boundary.
 */
import { z } from "zod";
import {
  AutonomyLevel,
  CardType,
  Cents,
  ClaimClass,
  ExecutionFidelity,
  FindingState,
  InterventionState,
  IsoDate,
  Lever,
  MeasurementFamily,
  MetricContract,
  OverlapStatus,
  PersistenceClass,
  PersistenceStatus,
  ReconStatus,
  VerificationOutcome,
} from "./primitives";

/* ---------- charts.ts ----------------------------------------------------- */

export const SeriesPoint = z.object({ date: IsoDate, v: z.number() });
export type SeriesPoint = z.infer<typeof SeriesPoint>;

export const DriftOnset = z.object({
  onsetIndex: z.number().int(),
  onsetDate: IsoDate,
  signalIndex: z.number().int(),
  signalDate: IsoDate,
  direction: z.enum(["high", "low"]),
});
export type DriftOnset = z.infer<typeof DriftOnset>;

/* ---------- measure.ts ---------------------------------------------------- */

export const DatedValue = z.object({ date: IsoDate, y: z.number() });
export type DatedValue = z.infer<typeof DatedValue>;

export const PlaceboResult = z.object({
  ok: z.boolean(),
  pass: z.boolean(),
  point: z.number(),
  se: z.number(),
  t: z.number(),
  crit: z.number(),
  note: z.string().optional(),
});
export type PlaceboResult = z.infer<typeof PlaceboResult>;

export const EstimateMethod = z.enum(["did", "reconciliation"]);
export type EstimateMethod = z.infer<typeof EstimateMethod>;

const FourCells = z.object({ Tpre: z.number(), Tpost: z.number(), Cpre: z.number(), Cpost: z.number() });

export const EstimateOk = z.object({
  ok: z.literal(true),
  method: EstimateMethod,
  point: z.number(),
  se: z.number(),
  df: z.number(),
  tcrit: z.number(),
  tcrit2: z.number(),
  ci: z.tuple([z.number(), z.number()]),
  lower: z.number(),
  upper: z.number(),
  means: FourCells,
  n: FourCells,
  dT: z.number(),
  dC: z.number(),
  placebo: PlaceboResult,
  preFit: z.number(),
  alpha: z.number(),
  mde: z.number(),
  sePlanned: z.number(),
  indexMove: z.number().optional(),
  indexShare: z.number().optional(),
  attributionNote: z.string().optional(),
  window: z.object({ execDate: IsoDate, preLo: IsoDate, postHi: IsoDate, mid: IsoDate.optional() }),
});
export type EstimateOk = z.infer<typeof EstimateOk>;

export const EstimateFailed = z.object({
  ok: z.literal(false),
  method: EstimateMethod,
  reason: z.string(),
  n: z.record(z.string(), z.number()),
});
export type EstimateFailed = z.infer<typeof EstimateFailed>;

export const Estimate = z.discriminatedUnion("ok", [EstimateOk, EstimateFailed]);
export type Estimate = z.infer<typeof Estimate>;

export const ServiceScope = z.object({
  locs: z.array(z.string()).optional(),
  dayparts: z.array(z.string()).optional(),
  dows: z.array(z.number()).optional(),
});
export type ServiceScope = z.infer<typeof ServiceScope>;

/* ---------- guardrails.ts ------------------------------------------------- */

export const GuardrailResult = z.object({
  id: z.string(),
  label: z.string(),
  observed: z.number().nullable(),
  passed: z.boolean(),
  observedLabel: z.string(),
  thresholdLabel: z.string(),
  why: z.string().optional(),
  optimistic: z.number().optional(),
  baseline: z.number().optional(),
  tol: z.number().optional(),
  est: Estimate.optional(),
  mode: z.enum(["did", "pre/post"]).optional(),
});
export type GuardrailResult = z.infer<typeof GuardrailResult>;

/* ---------- verify.ts ----------------------------------------------------- */

export const GateResult = z.object({
  id: z.string(),
  label: z.string(),
  passed: z.boolean(),
  detail: z.string(),
  blocking: z.boolean(),
});
export type GateResult = z.infer<typeof GateResult>;

export const GateRun = z.object({
  gates: z.array(GateResult),
  allPassed: z.boolean(),
  failed: z.array(GateResult),
  soft: z.array(GateResult),
});
export type GateRun = z.infer<typeof GateRun>;

export const DataQualityVerdict = z.object({ pass: z.boolean(), detail: z.string() });
export type DataQualityVerdict = z.infer<typeof DataQualityVerdict>;

export const VerificationResult = z.object({
  outcome: VerificationOutcome,
  label: z.string(),
  why: z.string(),
  /** Bookable money exists only when the mint produced it; null on every other outcome. */
  money: z
    .object({ cents: Cents, klass: ClaimClass, meta: z.record(z.string(), z.unknown()).optional() })
    .nullable(),
  gateRun: GateRun.optional(),
  limitation: z.string().nullish(),
  breaches: z.array(GuardrailResult).optional(),
});
export type VerificationResult = z.infer<typeof VerificationResult>;

/* ---------- persistence.ts ------------------------------------------------ */

export const PersistenceResult = z.object({
  status: PersistenceStatus,
  label: z.string().optional(),
  cls: PersistenceClass.optional(),
  note: z.string().optional(),
  /**
   * The engine sets this to `Infinity` for a non-decaying (structural) effect; JSON
   * serialises that as `null`, so the wire shape is nullish where the engine type is `?: number`.
   */
  halfLifeWeeks: z.number().nullish(),
  slopePerWeek: z.number().optional(),
  ciLo: z.number().optional(),
  ciHi: z.number().optional(),
  includesZero: z.boolean().optional(),
  checks: z.number(),
  elapsedWeeks: z.number().optional(),
  retention: z.number().optional(),
  series: z.array(DatedValue).optional(),
});
export type PersistenceResult = z.infer<typeof PersistenceResult>;

/* ---------- register.ts --------------------------------------------------- */

export const Location = z.object({
  id: z.string(),
  name: z.string(),
  short: z.string(),
  seats: z.number(),
  opened: IsoDate,
  gm: z.string(),
  chef: z.string(),
  concept: z.string(),
});
export type Location = z.infer<typeof Location>;

export const FeedTier = z.enum(["Pilot", "Next", "Later"]);
export type FeedTier = z.infer<typeof FeedTier>;

export const Feed = z.object({
  id: z.string(),
  name: z.string(),
  tier: FeedTier,
  access: z.string(),
  cadence: z.string(),
  slaHours: z.number().nullable(),
  fields: z.string(),
  stages: z.string(),
  newest: IsoDate.nullable(),
  rows: z.number(),
  degraded: z.string(),
  completeness: z.number(),
});
export type Feed = z.infer<typeof Feed>;

export const FeedHealth = Feed.extend({
  ageDays: z.number().nullable(),
  stale: z.boolean(),
});
export type FeedHealth = z.infer<typeof FeedHealth>;

/* ---------- detectors.ts -------------------------------------------------- */

export const Cause = z.object({ cause: z.string(), p: z.number(), sep: z.string() });
export type Cause = z.infer<typeof Cause>;

export const Remedy = z.object({
  change: z.string(),
  alternatives: z.array(z.string()),
  effort: z.number(),
  risk: z.enum(["low", "medium", "high", "blocked"]),
  latencyDays: z.number(),
  artifact: z.string(),
});
export type Remedy = z.infer<typeof Remedy>;

export const Observed = z.object({
  metric: z.string(),
  actual: z.number(),
  baseline: z.number(),
  unit: z.string(),
  periodLabel: z.string(),
});
export type Observed = z.infer<typeof Observed>;

export const BlockedBy = z.object({ feed: z.string(), ageDays: z.number().nullable(), why: z.string() });
export type BlockedBy = z.infer<typeof BlockedBy>;

export const FindingCore = z.object({
  id: z.string(),
  detector: z.string(),
  detectorCode: z.string(),
  domain: z.string(),
  lever: Lever,
  family: MeasurementFamily,
  loc: z.string(),
  locs: z.array(z.string()),
  daypart: z.string().nullable(),
  dow: z.number().nullable(),
  scopeKey: z.string(),
  account: z.string(),
  equations: z.array(z.string()),
  feeds: z.array(z.string()),
  title: z.string(),
  plain: z.string(),
  onset: DriftOnset.nullable(),
  observed: Observed,
  exposureCents: Cents,
  projectedLowCents: Cents.optional(),
  projectedHighCents: Cents.optional(),
  series: z.array(SeriesPoint),
  chartBaselineN: z.number().nullable(),
  evidenceCount: z.number(),
  cadenceDays: z.number(),
  causes: z.array(Cause),
  remedy: Remedy,
  guardrails: z.array(z.string()),
  contraindications: z.array(z.string()),
  autonomy: AutonomyLevel,
  claimCeiling: z.literal("modelled").optional(),
  items: z.array(z.string()).optional(),
  sku: z.string().optional(),
  blockedBy: BlockedBy.nullish(),
  extra: z.record(z.string(), z.unknown()).optional(),
});
export type FindingCore = z.infer<typeof FindingCore>;

export const QualificationTest = z.object({
  id: z.enum(["data", "feasibility", "recoverability", "overlap"]),
  label: z.string(),
  pass: z.boolean(),
  detail: z.string(),
});
export type QualificationTest = z.infer<typeof QualificationTest>;

export const Qualification = z.object({
  pass: z.boolean(),
  tests: z.array(QualificationTest),
  completeness: z.number(),
  staleFeeds: z.array(z.string()),
});
export type Qualification = z.infer<typeof Qualification>;

export const OverlapRef = z.object({ id: z.string(), rule: z.string(), cents: z.number(), role: z.string().optional() });
export type OverlapRef = z.infer<typeof OverlapRef>;

export const FindingRejection = z.object({ by: z.string(), on: IsoDate, code: z.string(), reason: z.string() });
export type FindingRejection = z.infer<typeof FindingRejection>;

/* ---------- ledger.ts ----------------------------------------------------- */

export const LedgerFinding = FindingCore.extend({
  state: FindingState,
  stateReason: z.string().nullish(),
  recoverableCents: Cents,
  qualification: Qualification,
  detectedOn: IsoDate,
  decisionOpenedOn: IsoDate,
  expiresOn: IsoDate,
  historical: z.boolean().optional(),
  convertedTo: z.string().nullish(),
  overlapStatus: OverlapStatus,
  overlapDeductionCents: z.number(),
  overlapRefs: z.array(OverlapRef),
  overlapNote: z.string().nullish(),
  effortHours: z.number(),
  evPerHour: z.number(),
  rejection: FindingRejection.nullish(),
});
export type LedgerFinding = z.infer<typeof LedgerFinding>;

export const ActionState = z.enum(["open", "done", "not_executed"]);
export type ActionState = z.infer<typeof ActionState>;

export const LedgerAction = z.object({
  id: z.string(),
  title: z.string(),
  owner: z.string(),
  dueOn: IsoDate,
  state: ActionState,
  loc: z.string(),
  interventionId: z.string().nullable(),
  findingId: z.string().nullish(),
  next: z.string(),
  evidenceRequired: z.string(),
  tier: z.enum(["Owner", "Operator"]).optional(),
  doneOn: IsoDate.nullish(),
});
export type LedgerAction = z.infer<typeof LedgerAction>;

export const AdjustmentKind = z.enum(["Reversal", "Decay", "Dispute"]);
export type AdjustmentKind = z.infer<typeof AdjustmentKind>;

export const Adjustment = z.object({
  id: z.string(),
  kind: AdjustmentKind,
  interventionId: z.string(),
  title: z.string(),
  loc: z.string(),
  cents: Cents,
  status: z.enum(["open", "credited", "accepted"]),
  reason: z.string(),
  by: z.string(),
  on: IsoDate,
  originalCents: Cents,
  weeks: z.number().optional(),
  note: z.string().optional(),
  foundBy: z.string().optional(),
});
export type Adjustment = z.infer<typeof Adjustment>;

export const LedgerSide = z.object({
  status: ReconStatus,
  observedCents: Cents,
  timingCents: Cents,
  unexplainedCents: Cents,
  explanation: z.string(),
  reviewer: z.string(),
  periodLabel: z.string(),
  quantityEffect: z.string(),
  rateEffect: z.string(),
  mixEffect: z.string(),
});
export type LedgerSide = z.infer<typeof LedgerSide>;

export const Period = z.object({ from: IsoDate, to: IsoDate, label: z.string(), fiscal: z.string() });
export type Period = z.infer<typeof Period>;

export const KpiKlass = z.enum(["Estimated", "Modelled", "Causal", "Bookable", "—"]);
export type KpiKlass = z.infer<typeof KpiKlass>;

export const Kpi = z.object({
  id: z.string(),
  label: z.string(),
  /** A `Money` (serialised `{ cents, klass }`) or a bare number for ratios, percentages and counts. */
  value: z.union([z.object({ cents: Cents, klass: ClaimClass, meta: z.record(z.string(), z.unknown()).optional() }), z.number()]),
  klass: KpiKlass,
  definition: z.string(),
  drillTo: z.string(),
  read: z.string(),
  hero: z.boolean().optional(),
  isRatio: z.boolean().optional(),
  isCount: z.boolean().optional(),
  isPct: z.boolean().optional(),
  neverTotal: z.boolean().optional(),
  contract: MetricContract,
});
export type Kpi = z.infer<typeof Kpi>;

export const FunnelStage = z.object({
  stage: z.string(),
  n: z.number(),
  cents: Cents,
  klass: ClaimClass.nullable(),
  lost: z.string().nullable(),
});
export type FunnelStage = z.infer<typeof FunnelStage>;

export const ConversionMetric = z.object({
  id: z.string(),
  label: z.string(),
  def: z.string(),
  measures: z.string(),
  target: z.union([z.number(), z.tuple([z.number(), z.number()])]).nullable(),
  dir: z.enum(["gte", "band", "lte_days", "gte_x", "none"]),
  bad: z.string(),
  value: z.number().nullable(),
  ok: z.boolean().nullable(),
});
export type ConversionMetric = z.infer<typeof ConversionMetric>;

export const Accrual = z.object({
  daily: z.array(DatedValue),
  byWeek: z.array(z.object({ week: IsoDate, cents: Cents })),
  byMonth: z.array(z.object({ month: z.string(), cents: Cents, adjustmentsCents: Cents, feeCents: Cents })),
  todayCents: Cents,
  weekCents: Cents,
  monthCents: Cents,
  cumulative: z.array(DatedValue),
});
export type Accrual = z.infer<typeof Accrual>;

export const FeedRisk = z.object({
  feedId: z.string(),
  openExposureCents: Cents,
  monitoringCents: Cents,
  verifiedAtRiskCents: Cents,
  blockedCents: Cents,
});
export type FeedRisk = z.infer<typeof FeedRisk>;

export const BridgeLine = z.object({ k: z.string(), v: z.string() });
export type BridgeLine = z.infer<typeof BridgeLine>;

export const Bridge = z.object({
  claimCents: Cents,
  account: z.string(),
  status: ReconStatus,
  statusLabel: z.string(),
  observedCents: Cents,
  timingCents: Cents,
  unexplainedCents: Cents,
  reconciledCents: Cents,
  lines: z.array(BridgeLine),
});
export type Bridge = z.infer<typeof Bridge>;

/* ---------- interventions.ts ---------------------------------------------- */

export const MetricKey = z.enum([
  "labour_per_cover",
  "comps_per_cover",
  "cm_per_cover",
  "cogs_per_cover",
  "net_per_cover",
  "ticket_min",
  "item_cost_per_unit",
  "sku_unit_price",
  "sku_cost_per_plate",
]);
export type MetricKey = z.infer<typeof MetricKey>;

export const MeasurementPlan = z.object({
  primary: z.string(),
  unit: z.string(),
  baselineDays: z.number(),
  windowDays: z.number(),
  minObservations: z.number(),
  preferredObservations: z.number(),
  latencyDays: z.number(),
  comparison: z.string(),
  guardrails: z.array(z.string()),
  rung: z.number(),
  confounders: z.array(z.string()),
  exclusions: z.string(),
  z: z.string(),
  stop: z.string(),
  persistence: z.string(),
});
export type MeasurementPlan = z.infer<typeof MeasurementPlan>;

export const EvidenceItem = z.object({ type: z.string(), detail: z.string(), resolved: z.boolean() });
export type EvidenceItem = z.infer<typeof EvidenceItem>;

export const Reversal = z.object({
  on: IsoDate,
  by: z.string(),
  reason: z.string(),
  creditNote: z.string(),
  foundBy: z.string(),
});
export type Reversal = z.infer<typeof Reversal>;

export const AppliedChange = z.object({
  kind: z.enum(["labour_hours", "comps_rate", "sku_price", "portion", "price", "ticket", "none"]),
  loc: z.string().optional(),
  daypart: z.string().optional(),
  dows: z.array(z.number()).optional(),
  from: IsoDate,
  value: z.number(),
  item: z.string().optional(),
  sku: z.string().optional(),
  roles: z.record(z.string(), z.number()).optional(),
});
export type AppliedChange = z.infer<typeof AppliedChange>;

export const ItemScope = z.object({ loc: z.string(), items: z.array(z.string()) });
export type ItemScope = z.infer<typeof ItemScope>;

export const InterventionDecl = z.object({
  id: z.string(),
  findingId: z.string(),
  title: z.string(),
  lever: Lever,
  family: MeasurementFamily,
  domain: z.string(),
  loc: z.string(),
  locs: z.array(z.string()),
  daypart: z.string().nullable(),
  dows: z.array(z.number()).optional(),
  account: z.string(),
  autonomy: AutonomyLevel,
  hypothesis: z.string(),
  change: z.string(),
  notChanging: z.string(),
  owner: z.string(),
  approver: z.string(),
  approvalTier: z.enum(["Operator", "Owner"]),
  decidedOn: IsoDate,
  execOn: IsoDate,
  executionFidelity: ExecutionFidelity,
  evidence: z.array(EvidenceItem),
  incrementalCostCents: z.number(),
  recurringCostCents: z.number().optional(),
  rung: z.number(),
  plan: MeasurementPlan,
  treatScope: ServiceScope.optional(),
  controlScope: ServiceScope.nullish(),
  treatSku: z.string().optional(),
  controlSkus: z.array(z.string()).optional(),
  treatItems: ItemScope.optional(),
  controlItems: ItemScope.optional(),
  metricKey: MetricKey,
  grain: z.enum(["cover", "unit", "sku", "sku_unit", "service"]),
  direction: z.enum(["down_is_saving", "up_is_saving"]),
  weekly: z.boolean(),
  estimator: z.enum(["did", "reconcile"]),
  projectedCents: Cents,
  reversal: Reversal.optional(),
  appliedChange: AppliedChange.optional(),
  overlapStatus: OverlapStatus.optional(),
  overlapDeductionCents: z.number().optional(),
  lifecycleState: InterventionState.optional(),
});
export type InterventionDecl = z.infer<typeof InterventionDecl>;

export const HistoryEvent = z.object({ on: IsoDate, state: z.string(), by: z.string(), note: z.string() });
export type HistoryEvent = z.infer<typeof HistoryEvent>;

export const ScaledEstimate = EstimateOk.extend({
  rawPoint: z.number(),
  rawSe: z.number(),
  wkFactor: z.number(),
  wkBasis: z.string(),
  sign: z.number(),
});
export type ScaledEstimate = z.infer<typeof ScaledEstimate>;

export const InterventionEval = InterventionDecl.extend({
  state: InterventionState,
  eligibleOn: IsoDate,
  windowClosed: z.boolean(),
  observed: z.number(),
  observedOf: z.number(),
  series: z.object({ treatment: z.array(DatedValue), control: z.array(DatedValue) }),
  rawEstimate: Estimate,
  estimate: ScaledEstimate.nullable(),
  guardrailResults: z.array(GuardrailResult),
  dataQuality: DataQualityVerdict,
  result: VerificationResult,
  persistence: PersistenceResult.nullable(),
  persistenceSeries: z.array(DatedValue),
  realizedCents: Cents,
  weeksHeld: z.number(),
  annualRunRateCents: Cents,
  reversedClaimCents: Cents.nullable(),
  weeksBooked: z.number(),
  adjustmentCents: Cents,
  history: z.array(HistoryEvent),
});
export type InterventionEval = z.infer<typeof InterventionEval>;

/* ---------- queue.ts ------------------------------------------------------ */

export const QueueRef = z.object({
  kind: z.enum(["finding", "intervention", "action", "feed", "adjustment"]),
  id: z.string(),
});
export type QueueRef = z.infer<typeof QueueRef>;

export const QueueCard = z.object({
  id: z.string(),
  type: CardType,
  label: z.string(),
  act: z.string(),
  who: z.string(),
  rank: z.number(),
  title: z.string(),
  body: z.string(),
  ref: QueueRef,
  loc: z.string(),
  moneyCents: Cents.nullish(),
  moneyClass: z.enum(["recoverable", "committed"]).nullish(),
  dueOn: IsoDate.nullish(),
  overdue: z.boolean().optional(),
});
export type QueueCard = z.infer<typeof QueueCard>;

/* ---------- confidence.ts ------------------------------------------------- */

export const ConfidenceDimension = z.object({ score: z.number(), basis: z.string(), blocks: z.string() });
export type ConfidenceDimension = z.infer<typeof ConfidenceDimension>;

/** System 14: the eight dimensions. A compact word always expands to these. */
export const ConfidenceProfile = z.object({
  data: ConfidenceDimension,
  measurement: ConfidenceDimension,
  attribution: ConfidenceDimension,
  execution: ConfidenceDimension,
  comparability: ConfidenceDimension,
  guardrail: ConfidenceDimension,
  persistence: ConfidenceDimension,
  reconciliation: ConfidenceDimension,
});
export type ConfidenceProfile = z.infer<typeof ConfidenceProfile>;
