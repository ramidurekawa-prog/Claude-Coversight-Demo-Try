/**
 * Primitives and vocabularies shared by every schema: ISO business dates,
 * integer cents, the claim-class ladder, and the enumerations the engine
 * declares as string unions. Every list here is copied verbatim from the
 * engine (packages/engine/src/*.ts) — the engine is the source of truth.
 */
import { z } from "zod";

/** Business date, location-local, `YYYY-MM-DD`. The engine never carries a Date object. */
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected an ISO business date YYYY-MM-DD");
export type IsoDate = z.infer<typeof IsoDate>;

/** Money is integer cents at every boundary (rule 1). */
export const Cents = z.number().int();
export type Cents = z.infer<typeof Cents>;

/* ---------- money.ts ------------------------------------------------------ */

export const CLAIM_CLASSES = [
  "profit_exposure",
  "identified_exposure",
  "recoverable",
  "projected",
  "committed",
  "measured",
  "causal",
  "verified",
  "bookable",
  "realized",
  "maintained",
  "adjustment",
] as const;
export const ClaimClass = z.enum(CLAIM_CLASSES);
export type ClaimClass = z.infer<typeof ClaimClass>;

/**
 * How an engine `Money` travels over the wire: `Money.toJSON()` emits `{ cents, klass }`
 * (meta is dropped by the engine's serialiser, so it is optional here).
 */
export const MoneyJson = z.object({
  cents: Cents,
  klass: ClaimClass,
  meta: z.record(z.string(), z.unknown()).optional(),
});
export type MoneyJson = z.infer<typeof MoneyJson>;

/* ---------- registry.ts --------------------------------------------------- */

export const Lever = z.enum(["labour_hours", "purchasing", "portion", "comps", "menu_price", "mix_shift", "ticket_time"]);
export type Lever = z.infer<typeof Lever>;

export const MeasurementFamily = z.enum(["A", "B", "C"]);
export type MeasurementFamily = z.infer<typeof MeasurementFamily>;

export const AutonomyLevel = z.enum(["A0", "A1", "A2", "A3", "A4"]);
export type AutonomyLevel = z.infer<typeof AutonomyLevel>;

export const ClaimCeiling = z.enum(["estimated", "modelled", "measured", "causal", "bookable", "realized"]);
export type ClaimCeiling = z.infer<typeof ClaimCeiling>;

/** The ten verification outcomes plus `pending` (the window is open) — VERIFICATION_OUTCOMES keys. */
export const VerificationOutcome = z.enum([
  "verified",
  "verified_limited",
  "directional",
  "inconclusive",
  "no_effect",
  "negative",
  "guardrail_failure",
  "data_failure",
  "attribution_conflict",
  "reversed",
  "pending",
]);
export type VerificationOutcome = z.infer<typeof VerificationOutcome>;

export const ReconStatus = z.enum(["not_eligible", "awaiting_close", "partial", "reconciled", "timing", "mapping", "unexplained", "not_in_gl"]);
export type ReconStatus = z.infer<typeof ReconStatus>;

export const METRIC_ATTRS = ["definition", "dateRange", "locationScope", "status", "confidence", "freshness", "lineage", "drillTo", "changeExplanation", "calcVersion"] as const;
export type MetricAttr = (typeof METRIC_ATTRS)[number];

/** System 6: the ten attributes every KPI must carry before it renders. */
export const MetricContract = z.object({
  definition: z.string(),
  dateRange: z.string(),
  locationScope: z.string(),
  status: z.string(),
  confidence: z.string(),
  freshness: z.string(),
  lineage: z.string(),
  drillTo: z.string(),
  changeExplanation: z.string(),
  calcVersion: z.string(),
});
export type MetricContract = z.infer<typeof MetricContract>;

export const CONFIDENCE_DIMENSION_KEYS = ["data", "measurement", "attribution", "execution", "comparability", "guardrail", "persistence", "reconciliation"] as const;
export const ConfidenceDimensionKey = z.enum(CONFIDENCE_DIMENSION_KEYS);
export type ConfidenceDimensionKey = z.infer<typeof ConfidenceDimensionKey>;

export const CONF_WORDS = ["Estimated", "Directional", "Measured", "Verified", "Persistent", "Reconciled"] as const;
export const ConfWord = z.enum(CONF_WORDS);
export type ConfWord = z.infer<typeof ConfWord>;

/* ---------- states.ts ----------------------------------------------------- */

export const FindingState = z.enum([
  "detected",
  "investigating",
  "data_insufficient",
  "qualified",
  "awaiting_decision",
  "accepted",
  "rejected",
  "superseded",
  "converted",
  "expired",
  "invalidated",
]);
export type FindingState = z.infer<typeof FindingState>;

export const InterventionState = z.enum([
  "draft",
  "awaiting_approval",
  "approved",
  "scheduled",
  "in_progress",
  "evidence_pending",
  "executed",
  "measurement_pending",
  "measuring",
  "inconclusive",
  "failed",
  "guardrail_failed",
  "verified",
  "persistence_monitoring",
  "persistent",
  "decayed",
  "reversed",
  "closed",
]);
export type InterventionState = z.infer<typeof InterventionState>;

export const RejectionCode = z.enum(["seasonal_not_negotiable", "already_addressed", "service_risk", "not_worth_effort", "wrong_root_cause", "other"]);
export type RejectionCode = z.infer<typeof RejectionCode>;

/* ---------- verify.ts / overlap.ts / persistence.ts / queue.ts ------------ */

export const ExecutionFidelity = z.enum(["not_started", "partial", "complete", "modified", "unknown"]);
export type ExecutionFidelity = z.infer<typeof ExecutionFidelity>;

export const OverlapStatus = z.enum(["none", "holds", "reduced", "unresolved"]);
export type OverlapStatus = z.infer<typeof OverlapStatus>;

export const PersistenceClass = z.enum(["structural", "durable", "upkeep"]);
export type PersistenceClass = z.infer<typeof PersistenceClass>;

export const PersistenceStatus = z.enum(["not_assessed", "holding", "decaying"]);
export type PersistenceStatus = z.infer<typeof PersistenceStatus>;

export const CardType = z.enum([
  "action_due",
  "high_value",
  "missing_evidence",
  "window_eligible",
  "verification_exception",
  "guardrail",
  "data_quality",
  "persistence",
  "reversal",
  "recon_question",
  "overlap",
]);
export type CardType = z.infer<typeof CardType>;
