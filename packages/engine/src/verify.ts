/**
 * The verification decision service — the only writer of a bookable dollar.
 *
 * Doctrine 8: the mint takes a gate verdict and a measured effect and throws if
 * either is absent or the verdict failed. It is reachable only through
 * verificationService(), which produces one of the ten outcomes (System 11).
 * Failed, rejected and inconclusive results are returned with their reason so
 * they can be stored permanently and rendered.
 */
import type { GuardrailResult } from "./guardrails.js";
import type { Estimate } from "./measure.js";
import { formatPct, formatUsd, Money } from "./money.js";
import { RUNGS, VERIFICATION_OUTCOMES, type VerificationOutcome } from "./registry.js";

export type ExecutionFidelity = "not_started" | "partial" | "complete" | "modified" | "unknown";

export interface GateResult {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
  blocking: boolean;
}

export interface GateRun {
  gates: GateResult[];
  allPassed: boolean;
  failed: GateResult[];
  soft: GateResult[];
}

export interface DataQualityVerdict {
  pass: boolean;
  detail: string;
}

export type OverlapStatus = "none" | "holds" | "reduced" | "unresolved";

export interface PlanForVerification {
  minObservations: number;
  preferredObservations: number;
  /** Counterfactual rung (1–7). */
  rung: number;
}

export interface VerificationInput {
  estimate: Estimate | null;
  executionFidelity: ExecutionFidelity;
  plan: PlanForVerification;
  incrementalCostCents?: number;
  recurringCostCents?: number;
  overlapStatus?: OverlapStatus;
  overlapDeductionCents?: number;
  /** The modelled weekly value at approval — lets the service tell "could not have seen it" from "did not work". */
  projectedCents?: number;
}

export interface VerificationContext {
  guardrailResults: GuardrailResult[];
  dataQuality: DataQualityVerdict;
  attributionConflict?: string | null;
}

export interface VerificationResult {
  outcome: VerificationOutcome;
  label: string;
  why: string;
  money: Money | null;
  gateRun?: GateRun;
  limitation?: string | null;
  breaches?: GuardrailResult[];
}

/* ---------- gates: every one must pass ------------------------------------ */

export function runGates(args: {
  est: Estimate;
  plan: PlanForVerification;
  guardrailResults: GuardrailResult[];
  dataQuality: DataQualityVerdict;
  executionFidelity: ExecutionFidelity;
  overlapStatus: OverlapStatus;
}): GateRun {
  const { est, plan, guardrailResults, dataQuality, executionFidelity, overlapStatus } = args;
  const g: GateResult[] = [];
  const add = (id: string, label: string, passed: boolean, detail: string, blocking = true) => g.push({ id, label, passed, detail, blocking });

  add(
    "EXEC",
    "Execution confirmed",
    executionFidelity === "complete" || executionFidelity === "modified",
    executionFidelity === "complete"
      ? "Evidence resolved against stored register records — complete."
      : executionFidelity === "modified"
        ? "Executed with a recorded deviation; measured as what was done."
        : `Execution fidelity is "${executionFidelity}" — verification is blocked entirely.`,
  );
  add("OBS", "Minimum observations", est.ok && est.n.Tpost >= plan.minObservations, est.ok ? `${est.n.Tpost} post-execution observations against a minimum of ${plan.minObservations}.` : "The window could not be formed.");
  add("POWER", "Effect exceeds the MDE", est.ok && Math.abs(est.point) >= est.mde, est.ok ? `Effect ${formatUsd(Math.abs(est.point))} against an MDE of ${formatUsd(est.mde)} computed before the window opened.` : "—");
  add(
    "TREND",
    "Parallel trends (placebo)",
    est.ok && est.placebo.ok && est.placebo.pass,
    est.ok && est.placebo.ok
      ? est.placebo.pass
        ? `Placebo DiD on the two pre-periods is ${formatUsd(est.placebo.point)} (t=${est.placebo.t.toFixed(2)}, crit ${est.placebo.crit.toFixed(2)}) — not distinguishable from zero.`
        : `Placebo DiD is ${formatUsd(est.placebo.point)} (t=${est.placebo.t.toFixed(2)}) — the control is not parallel. Result is inconclusive, not smaller.`
      : "Placebo could not be computed.",
  );
  add("SIGN", "Lower bound above zero", est.ok && est.point - est.tcrit * est.se > 0, est.ok ? `One-sided ${formatPct(1 - est.alpha, 0)} lower bound is ${formatUsd(est.point - est.tcrit * est.se)}.` : "—");
  add("COMP", "Control comparability", est.ok && est.preFit >= 0.55, est.ok ? `Pre-period correlation between treated and control series r = ${est.preFit.toFixed(2)} (threshold 0.55).` : "—", false);
  for (const gr of guardrailResults) {
    add(`GR:${gr.id}`, `Guardrail — ${gr.label}`, gr.passed, gr.observed === null ? "Not observed. A missing guardrail is a failure, not a pass." : `${gr.observedLabel} against a limit of ${gr.thresholdLabel}.`);
  }
  add("DQ", "Data quality through the window", dataQuality.pass, dataQuality.detail);
  add(
    "OVL",
    "Overlap resolved",
    overlapStatus !== "unresolved",
    overlapStatus === "unresolved"
      ? "Two claims intersect and nobody has allocated the dollars. Both are blocked."
      : overlapStatus === "reduced"
        ? "Intersection allocated to the narrower claim; this one is reduced by it."
        : "No intersecting claim on this scope, period and account.",
  );
  const blocking = g.filter((x) => x.blocking);
  return { gates: g, allPassed: blocking.every((x) => x.passed), failed: blocking.filter((x) => !x.passed), soft: g.filter((x) => !x.blocking && !x.passed) };
}

/* ---------- the mint (G8) — module-private -------------------------------- */

const MINT_TOKEN: unique symbol = Symbol("verification-decision-service");

function mint(token: symbol, args: { point: number; se: number; tcrit: number; incrementalCostCents: number; unresolvedOverlapCents: number; gates: GateRun }): Money {
  if (token !== MINT_TOKEN) throw new Error("MINT VIOLATION: bookable value may only be created by the verification decision service");
  if (!args.gates.allPassed) throw new Error("MINT VIOLATION: gates not passed");
  const lower = args.point - args.tcrit * args.se;
  const netted = lower - args.incrementalCostCents - args.unresolvedOverlapCents;
  return new Money(Math.max(0, Math.round(netted)), "bookable", { basis: "G8", point: args.point, se: args.se, tcrit: args.tcrit, lower, incrementalCostCents: args.incrementalCostCents, unresolvedOverlapCents: args.unresolvedOverlapCents });
}

/** Exposed only so a test can prove the mint refuses foreign callers. */
export function __mintWithWrongToken(): never {
  mint(Symbol("forged"), { point: 1, se: 0, tcrit: 1, incrementalCostCents: 0, unresolvedOverlapCents: 0, gates: { gates: [], allPassed: true, failed: [], soft: [] } });
  throw new Error("unreachable");
}

/* ---------- the decision service ------------------------------------------- */

export function verificationService(iv: VerificationInput, ctx: VerificationContext): VerificationResult {
  const est = iv.estimate;
  const R = (outcome: VerificationOutcome, extra: Partial<VerificationResult> = {}): VerificationResult => ({ outcome, label: VERIFICATION_OUTCOMES[outcome].label, why: "", money: null, ...extra });

  if (!est || !est.ok) return R("inconclusive", { why: "The measurement window could not be formed from valid observations." });
  if (ctx.dataQuality && !ctx.dataQuality.pass) return R("data_failure", { why: ctx.dataQuality.detail });
  if (iv.executionFidelity === "not_started" || iv.executionFidelity === "unknown") return R("inconclusive", { why: "Execution was never confirmed. Nothing downstream may be claimed." });

  const gr = ctx.guardrailResults;
  const grFail = gr.filter((x) => !x.passed);
  // est.point arrives already oriented so that POSITIVE means a saving, in cents per week.
  const savings = est.point;
  const lower = est.point - est.tcrit * est.se;

  if (est.placebo.ok && !est.placebo.pass) return R("inconclusive", { why: "The control failed its own placebo test — the pre-periods are not parallel, so the comparison cannot separate the change from the trend." });
  // A breach escalates whatever the primary effect did.
  if (grFail.length) {
    return R("guardrail_failure", {
      why: `${grFail.map((x) => x.label).join(", ")} breached. ${Math.abs(est.point) >= est.mde ? "The effect was real and it cost something the restaurant values more." : "The primary effect did not clear its MDE, and a guardrail moved anyway."} No partial credit, no override path.`,
      breaches: grFail,
    });
  }
  if (est.indexShare !== undefined && Math.abs(est.indexShare) > 0.5) return R("attribution_conflict", { why: est.attributionNote ?? "The concurrent index explains more than half of the observed move." });
  // "We could not tell" and "it did not work" are different facts.
  if (est.preFit < 0.4 && Math.abs(est.point) < est.mde) {
    return R("inconclusive", { why: `No valid control: the treated and comparison series correlate at r = ${est.preFit.toFixed(2)} before execution, and the observed effect ${formatUsd(savings)} is inside an MDE of ${formatUsd(est.mde)}. The design could not answer the question.` });
  }
  if (Math.abs(est.point) < est.mde) {
    // A positive that clears zero but sits below the effect the window was designed to see is
    // real and under-powered: reported as directional, never banked.
    if (savings > 0 && lower > 0) return R("directional", { why: `Point estimate ${formatUsd(savings)} clears zero (${formatPct(1 - est.alpha, 0)} lower bound ${formatUsd(lower)}) but is below the ${formatUsd(est.mde)} this window was designed to detect. An under-powered result is directional, not bookable; extend the window.` });
    // A window that could never have seen the projected effect proves nothing either way.
    if (iv.projectedCents != null && iv.projectedCents > 0 && est.mde > iv.projectedCents) return R("inconclusive", { why: `We could not tell: the window's minimum detectable effect is ${formatUsd(est.mde)}/wk against a projection of ${formatUsd(iv.projectedCents)}/wk, so even a fully delivered result would not have cleared it. That is a design failure, not a null.` });
    return R("no_effect", { why: `The change was made and the outcome did not move: ${formatUsd(savings)} against an MDE of ${formatUsd(est.mde)}, on a control that fits at r = ${est.preFit.toFixed(2)}.` });
  }
  if (savings < 0 && Math.abs(est.point) >= est.mde) return R("negative", { why: `The outcome moved the wrong way by ${formatUsd(-savings)}. A reversal is recommended.` });
  if (ctx.attributionConflict) return R("attribution_conflict", { why: ctx.attributionConflict });
  if (lower <= 0) return R("directional", { why: `Point estimate ${formatUsd(savings)} points the right way; the ${formatPct(1 - est.alpha, 0)} lower bound is ${formatUsd(lower)} and does not clear zero.` });

  const gateRun = runGates({ est, plan: iv.plan, guardrailResults: gr, dataQuality: ctx.dataQuality, executionFidelity: iv.executionFidelity, overlapStatus: iv.overlapStatus ?? "none" });
  if (!gateRun.allPassed) return R("inconclusive", { why: `A blocking gate failed: ${gateRun.failed.map((f) => f.label).join(", ")}`, gateRun });

  // Counting rule 13: every claim carries its incremental cost and the NET
  // figure is the default. A one-time cost is amortised across the 52-week horizon.
  const weeklyCost = Math.round((iv.incrementalCostCents ?? 0) / 52) + (iv.recurringCostCents ?? 0);
  const money = mint(MINT_TOKEN, { point: savings, se: est.se, tcrit: est.tcrit, incrementalCostCents: weeklyCost, unresolvedOverlapCents: iv.overlapDeductionCents ?? 0, gates: gateRun });

  const limited = gateRun.soft.length > 0 || iv.plan.rung >= 4 || est.n.Tpost < iv.plan.preferredObservations;
  const limitation = limited
    ? gateRun.soft.length
      ? (gateRun.soft[0] as GateResult).detail
      : iv.plan.rung >= 4
        ? `Attribution rung ${iv.plan.rung} — ${RUNGS[iv.plan.rung - 1]?.label ?? "unknown"} supports a claim with a named limitation.`
        : `Window closed at ${est.n.Tpost} observations against a preferred ${iv.plan.preferredObservations}.`
    : null;
  return R(limited ? "verified_limited" : "verified", {
    money,
    gateRun,
    limitation,
    why: `Effect ${formatUsd(savings)}; ${formatPct(1 - est.alpha, 0)} lower bound ${formatUsd(lower)}; every blocking gate passed.`,
  });
}
