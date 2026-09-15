/**
 * House sentences — Doctrine 10. Plain language first, derivation underneath.
 * Every sentence is built from computed figures; nothing here invents a number.
 */
import { formatDate } from "./dates.js";
import type { InterventionEval } from "./interventions.js";
import { formatUsd } from "./money.js";

export function plainOutcome(iv: InterventionEval): string {
  const r = iv.result;
  const e = iv.estimate;
  const guardrailsNamed = iv.guardrailResults.map((g) => g.label.toLowerCase()).join(", ");
  switch (r.outcome) {
    case "pending":
      if (iv.state === "measuring") return `Executed ${formatDate(iv.execOn)} — ${iv.change} ${iv.observed} of ${iv.observedOf} comparable services observed. ${iv.guardrailResults.some((g) => !g.passed) ? "A guardrail is moving." : "Guardrails healthy."} Result on ${formatDate(iv.eligibleOn)}.`;
      return `Approved ${formatDate(iv.decidedOn)}. Waiting for execution on ${formatDate(iv.execOn)}.`;
    case "verified":
    case "verified_limited":
      return `${iv.plan.primary} moved ${formatUsd(Math.abs(e?.point ?? 0))} a week. Comparable ${iv.plan.comparison.toLowerCase()} indicate at least ${formatUsd(r.money?.cents ?? 0)} a week is attributable to the change. ${guardrailsNamed ? `${capitalize(guardrailsNamed)} stayed inside their guardrails.` : ""} Verified${iv.persistence?.status === "holding" ? ", holding" : ""}, billable at ${formatUsd(r.money?.cents ?? 0)}.${r.limitation ? ` Limitation: ${r.limitation}` : ""}`;
    case "inconclusive":
      return `We cannot say. ${r.why} Not counted.`;
    case "no_effect":
      return `The change was made and nothing moved: ${formatUsd(Math.abs(e?.point ?? 0))} a week against a smallest detectable effect of ${formatUsd(e?.mde ?? 0)}. Recorded as a measured null at $0.`;
    case "negative":
      return `The outcome moved the wrong way by ${formatUsd(Math.abs(e?.point ?? 0))} a week. We recommend reversing it.`;
    case "guardrail_failure":
      return `We stopped it. ${r.breaches?.map((b) => b.label).join(" and ")} moved past ${r.breaches?.length === 1 ? "its" : "their"} limit${r.breaches?.length === 1 ? "" : "s"} while the change was in. A real saving that cost something the restaurant values more. Nothing was counted.`;
    case "directional":
      return `Points the right way — ${formatUsd(e?.point ?? 0)} a week — but the lower bound (${formatUsd(e?.lower ?? 0)}) does not clear zero. Not counted; it feeds the prior for this lever.`;
    case "data_failure":
      return `Paused — ${r.why} The claim is quarantined until the data gap is closed.`;
    case "attribution_conflict":
      return `Another movement plausibly explains the change: ${r.why} No claim until it is resolved.`;
    case "reversed":
      return `Withdrawn. ${r.why} ${iv.reversal?.creditNote ?? ""}`;
    default:
      return r.why;
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The proposed-stage house sentence for a finding. */
export function plainProposal(args: { plain: string; recoverableCents: number; guardrails: string[]; windowDays: number; comparison: string }): string {
  const watch = args.guardrails.map((g) => g.replace(/_/g, " ")).join(", ");
  return `${args.plain} Could save approximately ${formatUsd(args.recoverableCents)} a week. We would watch ${watch} for ${Math.round(args.windowDays / 7)} weeks against ${args.comparison.toLowerCase()}.`;
}
