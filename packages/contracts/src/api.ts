/**
 * The API surface under /api/v1: summary projections the routes build from
 * engine records, the request bodies and queries, and one response schema per
 * route. The web app imports these and never types a response by hand.
 */
import { z } from "zod";
import {
  Accrual,
  Adjustment,
  BlockedBy,
  Bridge,
  ConfidenceProfile,
  ConversionMetric,
  EvidenceItem,
  FeedHealth,
  FeedRisk,
  FunnelStage,
  InterventionEval,
  Kpi,
  LedgerAction,
  LedgerFinding,
  LedgerSide,
  Location,
  Period,
  QueueCard,
} from "./engine";
import {
  AutonomyLevel,
  Cents,
  ConfWord,
  FindingState,
  InterventionState,
  IsoDate,
  Lever,
  MeasurementFamily,
  OverlapStatus,
  PersistenceClass,
  PersistenceStatus,
  ReconStatus,
  RejectionCode,
  VerificationOutcome,
} from "./primitives";

/* ---------- summary projections ------------------------------------------- */

/** A finding as it appears in a list: the ledger record without its series and evidence. */
export const FindingSummary = z.object({
  id: z.string(),
  title: z.string(),
  plain: z.string(),
  state: FindingState,
  stateReason: z.string().nullish(),
  lever: Lever,
  domain: z.string(),
  family: MeasurementFamily,
  loc: z.string(),
  locs: z.array(z.string()),
  daypart: z.string().nullable(),
  account: z.string(),
  exposureCents: Cents,
  recoverableCents: Cents,
  detectedOn: IsoDate,
  decisionOpenedOn: IsoDate,
  expiresOn: IsoDate,
  overlapStatus: OverlapStatus,
  overlapDeductionCents: Cents,
  historical: z.boolean(),
  convertedTo: z.string().nullish(),
  evPerHour: z.number(),
  effortHours: z.number(),
  blockedBy: BlockedBy.nullish(),
  autonomy: AutonomyLevel,
  claimCeiling: z.literal("modelled").optional(),
  confidenceWord: ConfWord,
});
export type FindingSummary = z.infer<typeof FindingSummary>;

/** An intervention as it appears in a list or a loop section: outcome, money by class, persistence. */
export const InterventionSummary = z.object({
  id: z.string(),
  findingId: z.string(),
  title: z.string(),
  lever: Lever,
  family: MeasurementFamily,
  domain: z.string(),
  loc: z.string(),
  locs: z.array(z.string()),
  daypart: z.string().nullable(),
  state: InterventionState,
  /** One of the ten outcomes, or `pending` while the window is open. */
  outcome: VerificationOutcome,
  outcomeLabel: z.string(),
  execOn: IsoDate,
  eligibleOn: IsoDate,
  decidedOn: IsoDate,
  windowClosed: z.boolean(),
  observed: z.number(),
  observedOf: z.number(),
  projectedCents: Cents,
  bookableCents: Cents.nullable(),
  estimatePointCents: Cents.nullable(),
  estimateLowerCents: Cents.nullable(),
  realizedCents: Cents,
  annualRunRateCents: Cents,
  persistenceStatus: PersistenceStatus.nullable(),
  persistenceClass: PersistenceClass.nullable(),
  owner: z.string(),
  approver: z.string(),
  confidenceWord: ConfWord,
  reversed: z.boolean(),
  reconStatus: ReconStatus.nullable(),
});
export type InterventionSummary = z.infer<typeof InterventionSummary>;

export const AuditEntityKind = z.enum(["finding", "intervention", "action", "adjustment", "feed", "org"]);
export type AuditEntityKind = z.infer<typeof AuditEntityKind>;

/** Rule 9: every transition carries an actor, a business date, a reason where required, and is immutable. */
export const AuditEvent = z.object({
  id: z.string(),
  orgId: z.string(),
  /** Business date of the event. */
  on: IsoDate,
  /** Wall-clock timestamp the row was written (ISO 8601). */
  at: z.string(),
  actor: z.string(),
  entityKind: AuditEntityKind,
  entityId: z.string(),
  event: z.string(),
  fromState: z.string().nullish(),
  toState: z.string().nullish(),
  reason: z.string().nullish(),
  payload: z.record(z.string(), z.unknown()).nullish(),
});
export type AuditEvent = z.infer<typeof AuditEvent>;

export const PipelineRun = z.object({
  id: z.string(),
  asOf: IsoDate,
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  engineVersion: z.string(),
  fixtureVersion: z.string().nullable(),
  findingsFired: z.number().int(),
  notes: z.string().nullable(),
});
export type PipelineRun = z.infer<typeof PipelineRun>;

export const ApiError = z.object({
  error: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof ApiError>;

/** For an org whose register has not yet delivered a full baseline. */
export const BaselineProgress = z.object({ deliveredDays: z.number().int(), requiredDays: z.number().int() });
export type BaselineProgress = z.infer<typeof BaselineProgress>;

export const Versions = z.object({ engine: z.string(), calc: z.string(), fixture: z.string().nullable() });
export type Versions = z.infer<typeof Versions>;

/* ---------- health / me --------------------------------------------------- */

export const HealthResponse = z.object({
  ok: z.literal(true),
  version: z.string(),
  db: z.enum(["ok", "unavailable"]),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

export const PersonaRole = z.enum(["owner", "gm", "finance", "admin"]);
export type PersonaRole = z.infer<typeof PersonaRole>;

/** An engine Location plus its API `code` (the short id such as "oak"; `id` in the API is the same short code). */
export const ApiLocation = Location.extend({ code: z.string() });
export type ApiLocation = z.infer<typeof ApiLocation>;

export const MeResponse = z.object({
  user: z.object({ id: z.string(), name: z.string(), email: z.string() }),
  persona: z.object({ role: PersonaRole, title: z.string() }),
  org: z.object({
    id: z.string(),
    name: z.string(),
    asOf: IsoDate,
    synthetic: z.boolean(),
    fixtureVersion: z.string().nullable(),
    fixtureLabel: z.string().nullable(),
    feeMonthlyCents: Cents,
    feeNote: z.string(),
    fiscalCalendar: z.string(),
    connectedOn: IsoDate.nullable(),
  }),
  locations: z.array(ApiLocation),
  /** "all", or the location codes a GM may see. */
  scope: z.union([z.literal("all"), z.array(z.string())]),
  isAdmin: z.boolean(),
});
export type MeResponse = z.infer<typeof MeResponse>;

/** `scope=all` or a location code. */
export const ScopeQuery = z.object({ scope: z.string().optional() });
export type ScopeQuery = z.infer<typeof ScopeQuery>;

/* ---------- home / today / recovery --------------------------------------- */

export const HomeResponse = z.object({
  asOf: IsoDate,
  period: Period,
  kpis: z.array(Kpi),
  hero: z.object({ persistent: Kpi, multiple: Kpi }),
  loop: z.object({
    decisionsDue: z.array(QueueCard),
    executionsDue: z.array(QueueCard),
    testsRunning: z.array(InterventionSummary),
    resultsLanded: z.array(InterventionSummary),
    winsDecaying: z.array(InterventionSummary),
  }),
  dataConfidence: z.object({ value: z.number(), feeds: z.array(FeedHealth) }),
  baseline: BaselineProgress.optional(),
});
export type HomeResponse = z.infer<typeof HomeResponse>;

export const TodayResponse = z.object({
  asOf: IsoDate,
  cards: z.array(QueueCard),
  policyVersion: z.string(),
});
export type TodayResponse = z.infer<typeof TodayResponse>;

export const RecoveryResponse = z.object({
  asOf: IsoDate,
  period: Period,
  funnel: z.array(FunnelStage),
  conversions: z.array(ConversionMetric),
  kpis: z.array(Kpi),
});
export type RecoveryResponse = z.infer<typeof RecoveryResponse>;

/* ---------- findings ------------------------------------------------------ */

export const FindingsQuery = z.object({
  scope: z.string().optional(),
  state: FindingState.optional(),
  historical: z.enum(["true", "false"]).optional(),
});
export type FindingsQuery = z.infer<typeof FindingsQuery>;

export const FindingsResponse = z.object({
  asOf: IsoDate,
  findings: z.array(FindingSummary),
});
export type FindingsResponse = z.infer<typeof FindingsResponse>;

export const FindingDetailResponse = z.object({
  asOf: IsoDate,
  finding: LedgerFinding,
  confidence: ConfidenceProfile,
  confidenceWord: ConfWord,
  proposal: z.string(),
  overlapWith: z.array(FindingSummary),
  intervention: InterventionSummary.nullable(),
  allowedTransitions: z.array(FindingState),
  audit: z.array(AuditEvent),
});
export type FindingDetailResponse = z.infer<typeof FindingDetailResponse>;

export const FindingDecision = z.enum(["accept", "reject", "investigate"]);
export type FindingDecision = z.infer<typeof FindingDecision>;

export const DecideFindingBody = z.object({
  decision: FindingDecision,
  reason: z.string().optional(),
  code: RejectionCode.optional(),
  owner: z.string().optional(),
  dueOn: IsoDate.optional(),
  approver: z.string().optional(),
});
export type DecideFindingBody = z.infer<typeof DecideFindingBody>;

export const DecideFindingResponse = z.object({
  finding: LedgerFinding,
  action: LedgerAction.nullable(),
  intervention: InterventionEval.nullable(),
});
export type DecideFindingResponse = z.infer<typeof DecideFindingResponse>;

/* ---------- actions ------------------------------------------------------- */

export const ActionsResponse = z.object({
  asOf: IsoDate,
  actions: z.array(LedgerAction),
});
export type ActionsResponse = z.infer<typeof ActionsResponse>;

/** An evidence item as submitted: `resolved` may be omitted and defaults to true. */
export const EvidenceItemInput = EvidenceItem.extend({ resolved: z.boolean().default(true) });
export type EvidenceItemInput = z.input<typeof EvidenceItemInput>;

export const CompleteActionBody = z.object({
  evidence: z.array(EvidenceItemInput),
  doneOn: IsoDate.optional(),
});
export type CompleteActionBody = z.input<typeof CompleteActionBody>;
export type CompleteActionParsed = z.output<typeof CompleteActionBody>;

export const CompleteActionResponse = z.object({
  action: LedgerAction,
  intervention: InterventionEval.nullable(),
});
export type CompleteActionResponse = z.infer<typeof CompleteActionResponse>;

/* ---------- changes ------------------------------------------------------- */

export const ChangesResponse = z.object({
  asOf: IsoDate,
  interventions: z.array(InterventionSummary),
});
export type ChangesResponse = z.infer<typeof ChangesResponse>;

export const ChangeDetailResponse = z.object({
  asOf: IsoDate,
  intervention: InterventionEval,
  confidence: ConfidenceProfile,
  confidenceWord: ConfWord,
  outcomeSentence: z.string(),
  bridge: Bridge.nullable(),
  ledgerSide: LedgerSide.nullable(),
  finding: FindingSummary.nullable(),
  actions: z.array(LedgerAction),
  adjustments: z.array(Adjustment),
  audit: z.array(AuditEvent),
});
export type ChangeDetailResponse = z.infer<typeof ChangeDetailResponse>;

/* ---------- proof --------------------------------------------------------- */

export const ProofBridge = z.object({ interventionId: z.string(), title: z.string(), bridge: Bridge });
export type ProofBridge = z.infer<typeof ProofBridge>;

export const ProofResponse = z.object({
  asOf: IsoDate,
  period: Period,
  closedPeriod: Period,
  kpis: z.array(Kpi),
  ledger: z.array(InterventionSummary),
  accrual: Accrual,
  adjustments: z.array(Adjustment),
  bridges: z.array(ProofBridge),
  fee: z.object({ monthlyCents: Cents, periodCents: Cents, note: z.string() }),
  versions: Versions,
});
export type ProofResponse = z.infer<typeof ProofResponse>;

export const ProofPacketResponse = z.object({
  generatedOn: IsoDate,
  org: z.object({ name: z.string(), synthetic: z.boolean() }),
  intervention: InterventionEval,
  finding: LedgerFinding.nullable(),
  bridge: Bridge.nullable(),
  ledgerSide: LedgerSide.nullable(),
  adjustments: z.array(Adjustment),
  audit: z.array(AuditEvent),
  versions: Versions,
  confidence: ConfidenceProfile,
  confidenceWord: ConfWord,
  outcomeSentence: z.string(),
});
export type ProofPacketResponse = z.infer<typeof ProofPacketResponse>;

/* ---------- data ---------------------------------------------------------- */

export const DataResponse = z.object({
  asOf: IsoDate,
  feeds: z.array(FeedHealth),
  risk: z.array(FeedRisk),
  confidence: z.number(),
  blocked: z.array(FindingSummary),
  rowsDelivered: z.number().int(),
  baseline: BaselineProgress.optional(),
});
export type DataResponse = z.infer<typeof DataResponse>;

/* ---------- demo controls (synthetic-data only) --------------------------- */

export const AdvanceClockBody = z.object({ toDate: IsoDate });
export type AdvanceClockBody = z.infer<typeof AdvanceClockBody>;

export const AdvanceClockResponse = z.object({ asOf: IsoDate, run: PipelineRun });
export type AdvanceClockResponse = z.infer<typeof AdvanceClockResponse>;

export const ResetResponse = z.object({ asOf: IsoDate, seeded: z.boolean() });
export type ResetResponse = z.infer<typeof ResetResponse>;

/* ---------- audit --------------------------------------------------------- */

export const AuditQuery = z.object({
  entityKind: AuditEntityKind.optional(),
  entityId: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
});
export type AuditQuery = z.input<typeof AuditQuery>;
export type AuditQueryParsed = z.output<typeof AuditQuery>;

export const AuditResponse = z.object({ events: z.array(AuditEvent) });
export type AuditResponse = z.infer<typeof AuditResponse>;

/* ---------- sign-in (proxied better-auth) --------------------------------- */

export const SignInBody = z.object({ email: z.string(), password: z.string() });
export type SignInBody = z.infer<typeof SignInBody>;
