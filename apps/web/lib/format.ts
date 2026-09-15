/**
 * Formatting only. Nothing here computes a dollar: every figure arrives from
 * the engine in integer cents carrying its claim class, and these helpers
 * render it. The class → colour mapping is the one place colour is chosen.
 */
import { CLAIM_CLASS, formatDate, formatDateYear, formatPct, formatUsd, type ClaimClass } from "@streamline/engine";
import type { ConfWord, MoneyJson, VerificationOutcome } from "@streamline/contracts";

export { formatDate, formatDateYear, formatPct, formatUsd };

export type Tone = "est" | "mod" | "cau" | "book" | "bad" | "neu" | "ghost";

export function toneOfClass(klass: ClaimClass): Tone {
  switch (klass) {
    case "profit_exposure":
    case "identified_exposure":
    case "recoverable":
      return "est";
    case "projected":
    case "committed":
      return "mod";
    case "measured":
    case "causal":
      return "cau";
    case "verified":
    case "bookable":
    case "realized":
    case "maintained":
      return "book";
    case "adjustment":
      return "bad";
    default:
      return "neu";
  }
}

export function classLabel(klass: ClaimClass): string {
  return CLAIM_CLASS[klass]?.label ?? klass;
}

export function money(m: MoneyJson, opts: { dp?: number; sign?: boolean } = {}): string {
  return formatUsd(m.cents, opts);
}

export function perWeek(cents: number): string {
  return `${formatUsd(cents)}/wk`;
}

export function toneOfWord(w: ConfWord): Tone {
  switch (w) {
    case "Estimated":
      return "est";
    case "Directional":
      return "mod";
    case "Measured":
      return "cau";
    default:
      return "book";
  }
}

export function toneOfOutcome(o: VerificationOutcome): Tone {
  switch (o) {
    case "verified":
    case "verified_limited":
      return "book";
    case "pending":
      return "cau";
    case "directional":
    case "inconclusive":
    case "data_failure":
    case "attribution_conflict":
      return "mod";
    case "no_effect":
      return "neu";
    default:
      return "bad";
  }
}

export const FINDING_STATE_LABEL: Record<string, string> = {
  detected: "Detected",
  investigating: "Under investigation",
  qualified: "Qualified",
  awaiting_decision: "Awaiting decision",
  accepted: "Accepted",
  converted: "Converted to a change",
  rejected: "Declined",
  superseded: "Superseded",
  expired: "Expired",
  invalidated: "Invalidated",
  data_insufficient: "Data insufficient",
};

export const IV_STATE_LABEL: Record<string, string> = {
  draft: "Draft",
  awaiting_approval: "Awaiting approval",
  approved: "Approved",
  scheduled: "Scheduled",
  in_progress: "In progress",
  evidence_pending: "Evidence pending",
  executed: "Executed",
  measurement_pending: "Measurement pending",
  measuring: "Measuring",
  verified: "Verified",
  persistence_monitoring: "Persistence monitoring",
  persistent: "Persistent",
  decayed: "Decaying",
  inconclusive: "Inconclusive",
  failed: "No measurable effect",
  guardrail_failed: "Stopped by a guardrail",
  reversed: "Reversed",
  closed: "Closed",
};

export function daysLeft(from: string, to: string): number {
  const a = Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, Number(from.slice(8, 10)));
  const b = Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)));
  return Math.round((b - a) / 86_400_000);
}
