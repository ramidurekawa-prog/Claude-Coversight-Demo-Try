/**
 * Confidence in eight dimensions — System 14. Never a single badge: each
 * dimension carries its score, the basis that produced it, and what it blocks.
 */
import type { FindingCore } from "./detectors";
import type { InterventionEval } from "./interventions";
import { formatPct, formatUsd } from "./money";
import type { FeedHealth } from "./register";
import { type ConfidenceDimensionKey, type ConfWord, RECON_STATUS, RUNGS, type ReconStatus } from "./registry";
import { mean } from "./stats";

export interface ConfidenceDimension {
  score: number;
  basis: string;
  blocks: string;
}
export type ConfidenceProfile = Record<ConfidenceDimensionKey, ConfidenceDimension>;

export function findingConfidence(finding: FindingCore, feeds: readonly FeedHealth[]): ConfidenceProfile {
  const feedsFor = finding.feeds.map((id) => feeds.find((f) => f.id === id)).filter((f): f is FeedHealth => !!f);
  const comp = feedsFor.length ? mean(feedsFor.map((f) => f.completeness)) : 0;
  const fresh = feedsFor.every((f) => !f.stale);
  return {
    data: { score: Math.min(1, (finding.evidenceCount / 12) * 0.5 + comp * 0.4 + (fresh ? 0.1 : 0)), basis: `${finding.evidenceCount} observations; ${formatPct(comp, 1)} source completeness across ${feedsFor.length} feeds; ${fresh ? "all fresh" : "a source is stale"}.`, blocks: "Blocks qualification below threshold" },
    measurement: { score: 0, basis: "No window has opened for this finding.", blocks: "Caps the claim at inconclusive" },
    attribution: { score: 0, basis: "Nothing has been executed, so no counterfactual exists.", blocks: "Caps the claim class" },
    execution: { score: 0, basis: "Not executed.", blocks: "Blocks verification entirely" },
    comparability: { score: 0, basis: "No control set has been chosen yet.", blocks: "Downgrades to verified with limitations" },
    guardrail: { score: finding.guardrails.length ? 0.6 : 0, basis: `${finding.guardrails.length} guardrails named in the recommendation; none observed yet.`, blocks: "A missing guardrail is a failure, not a pass" },
    persistence: { score: 0, basis: "No claim exists to persist.", blocks: "Governs annualisation eligibility" },
    reconciliation: { score: 0, basis: "No claim exists to reconcile.", blocks: "Governs fee eligibility" },
  };
}

export function interventionConfidence(iv: InterventionEval, recon?: { status: ReconStatus; note?: string } | null): ConfidenceProfile {
  const e = iv.estimate;
  const grDef = iv.guardrailResults.length;
  const grObs = iv.guardrailResults.filter((g) => g.observed !== null).length;
  return {
    data: { score: iv.dataQuality.pass ? 0.95 : 0.3, basis: iv.dataQuality.detail, blocks: "Blocks qualification below threshold" },
    measurement: {
      score: e ? Math.min(1, Math.abs(e.point) / Math.max(e.mde, 1) / 2) : 0,
      basis: e ? `Window ${iv.plan.windowDays} days, ${e.n.Tpost} observations at ${iv.plan.unit}. Effect ${formatUsd(Math.abs(e.point))} against a planned MDE of ${formatUsd(e.mde)}.` : "Window still open.",
      blocks: "Caps the claim at inconclusive",
    },
    attribution: {
      score: iv.plan.rung <= 3 ? 0.9 : 0.6,
      basis: `Rung ${iv.plan.rung} — ${RUNGS[iv.plan.rung - 1]?.label ?? "unknown"}. ${e && e.placebo.ok ? (e.placebo.pass ? "Parallel-trends placebo passed." : "Parallel-trends placebo FAILED.") : "No placebo available for this method."}`,
      blocks: "Caps the claim class",
    },
    execution: {
      score: iv.executionFidelity === "complete" ? 1 : iv.executionFidelity === "modified" ? 0.7 : iv.executionFidelity === "partial" ? 0.4 : 0,
      basis: `${iv.evidence.length} evidence item${iv.evidence.length === 1 ? "" : "s"}, ${iv.evidence.every((x) => x.resolved) ? "all resolved against stored records" : "not all resolved"}. Fidelity: ${iv.executionFidelity}.`,
      blocks: "Blocks verification entirely",
    },
    comparability: { score: e ? Math.max(0, Math.min(1, e.preFit + 0.2)) : 0, basis: e ? `Pre-period fit r = ${e.preFit.toFixed(2)} across ${e.n.Tpre} baseline observations. ${iv.plan.comparison}` : "—", blocks: "Downgrades to verified with limitations" },
    guardrail: { score: grDef ? grObs / grDef : 0, basis: `${grObs} of ${grDef} guardrails observed over the same window. ${iv.guardrailResults.filter((g) => !g.passed).length} breached.`, blocks: "A missing guardrail is a failure, not a pass" },
    persistence: {
      // A decaying claim has failed its most recent check: the checks it passed earlier do not
      // make it persistent now, so the word can never say so while the value is leaving.
      score: iv.persistence ? (iv.persistence.status === "decaying" ? Math.min(0.3, iv.persistence.checks / 8) : Math.min(1, iv.persistence.checks / 4)) : 0,
      basis: iv.persistence ? `${iv.persistence.checks} persistence check${iv.persistence.checks === 1 ? "" : "s"} passed over ${iv.persistence.elapsedWeeks} weeks${iv.persistence.status === "decaying" ? " — the latest check found the effect decaying" : ""}. ${iv.persistence.note ?? ""}` : "Not yet assessed.",
      blocks: "Governs annualisation eligibility",
    },
    reconciliation: {
      score: recon ? (recon.status === "reconciled" ? 1 : recon.status === "partial" || recon.status === "timing" ? 0.6 : 0.2) : 0,
      basis: recon ? `${RECON_STATUS[recon.status].label}. ${recon.note ?? ""}` : "No bridge has been built for this claim.",
      blocks: "Governs fee eligibility",
    },
  };
}

/** The compact word — always decomposable into the eight dimensions above. */
export function confidenceWord(p: ConfidenceProfile | null): ConfWord {
  if (!p) return "Estimated";
  if (p.reconciliation.score >= 0.9) return "Reconciled";
  if (p.persistence.score >= 0.5) return "Persistent";
  if (p.execution.score > 0 && p.measurement.score >= 0.5 && p.guardrail.score >= 1) return "Verified";
  if (p.measurement.score > 0) return "Measured";
  if (p.attribution.score > 0) return "Directional";
  return "Estimated";
}
