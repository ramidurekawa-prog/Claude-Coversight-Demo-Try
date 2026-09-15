/**
 * Labels for the measurement and proof screens. Words only: nothing here
 * touches a dollar. Vocabularies come from the engine registry so a lever,
 * a rung or a reconciliation status reads the same on every surface.
 */
import type { ApiLocation, ExecutionFidelity, InterventionEval, InterventionState, InterventionSummary, Lever, PersistenceClass, PersistenceStatus, ReconStatus } from "@streamline/contracts";
import { AUTONOMY, LEVERS, RECON_STATUS, RUNGS } from "@streamline/engine";
import { IV_STATE_LABEL, toneOfOutcome, type Tone } from "../../../../lib/format";

/** The room a record belongs to, by its short name; group-wide claims say so. */
export function roomLabel(loc: string, locations: ApiLocation[]): string {
  if (loc === "group") return "All rooms";
  return locations.find((l) => l.code === loc)?.short ?? loc;
}

export function leverLabel(lever: Lever): string {
  return LEVERS[lever]?.label ?? lever;
}

export function rungLabel(rung: number): string {
  const r = RUNGS.find((x) => x.n === rung);
  return r ? `rung ${rung} — ${r.label}` : `rung ${rung}`;
}

export function autonomyLabel(level: InterventionEval["autonomy"]): string {
  const a = AUTONOMY.find((x) => x.level === level);
  return a ? `${level} · ${a.label}` : level;
}

export const FIDELITY_LABEL: Record<ExecutionFidelity, string> = {
  not_started: "Not started",
  partial: "Partial — the change went in, but not all of it",
  complete: "Complete — evidence resolved against stored register records",
  modified: "Modified — executed differently from the plan",
  unknown: "Unknown — no evidence resolved",
};

export const PERSISTENCE_CLASS_LABEL: Record<PersistenceClass, string> = {
  structural: "Structural",
  durable: "Durable",
  upkeep: "Upkeep-dependent",
};

export const PERSISTENCE_STATUS_LABEL: Record<PersistenceStatus, string> = {
  not_assessed: "Not yet assessed",
  holding: "Holding",
  decaying: "Decaying",
};

export function estimatorLabel(estimator: InterventionEval["estimator"]): string {
  return estimator === "did" ? "Difference-in-differences against matched controls" : "Direct reconciliation against the vendor index";
}

export function reconLabel(status: ReconStatus | null): string {
  return status ? (RECON_STATUS[status]?.label ?? status) : "Awaiting the close";
}

/** Colour for a reconciliation status; the word always sits beside it. */
export function reconTone(status: ReconStatus | null): Tone {
  switch (status) {
    case "reconciled":
      return "book";
    case "timing":
    case "partial":
      return "est";
    case "unexplained":
    case "mapping":
      return "bad";
    case "not_in_gl":
      return "neu";
    default:
      return "ghost";
  }
}

/** A feed id as a name: "toast_orders" → "Toast orders". Ids only; nothing is invented. */
export function feedLabel(id: string): string {
  const s = id.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ---------- state groupings ------------------------------------------------ */

export type ChangeSectionKey = "needs" | "measuring" | "approved" | "holding" | "closed" | "draft";

export const CHANGE_SECTIONS: Array<{ key: ChangeSectionKey; title: string; sub: string; empty?: string }> = [
  { key: "needs", title: "Needs you", sub: "A guardrail breach, a decaying win, or a withdrawn claim. Each one names its next step.", empty: "Nothing needs you. Every guardrail held and every verified claim is holding." },
  { key: "measuring", title: "Measuring", sub: "Windows open. Projected value is modelled and never added to anything verified.", empty: "No window is open. Accept a finding, execute the action, and the clock starts." },
  { key: "approved", title: "Approved, not yet executed", sub: "The measurement clock starts at executed, never at approval." },
  { key: "holding", title: "Verified and holding", sub: "Every gate passed; the lower bound was booked; persistence is checked on the plan's schedule." },
  { key: "closed", title: "Closed without a claim", sub: "Nulls and inconclusive results stay on the record. They update the prior for the lever." },
  { key: "draft", title: "Drafts and awaiting approval", sub: "Not yet decided." },
];

const MEASURING: InterventionState[] = ["measuring", "executed", "measurement_pending"];
const APPROVED: InterventionState[] = ["approved", "scheduled", "in_progress", "evidence_pending"];
const HOLDING: InterventionState[] = ["verified", "persistence_monitoring", "persistent"];
const CLOSED: InterventionState[] = ["inconclusive", "failed", "closed"];

export function sectionOf(iv: InterventionSummary): ChangeSectionKey {
  if (iv.state === "guardrail_failed" || iv.state === "decayed" || iv.state === "reversed" || iv.outcome === "reversed") return "needs";
  if (MEASURING.includes(iv.state)) return "measuring";
  if (APPROVED.includes(iv.state)) return "approved";
  if (HOLDING.includes(iv.state)) return "holding";
  if (CLOSED.includes(iv.state)) return "closed";
  return "draft";
}

export function isMeasuringState(state: InterventionState): boolean {
  return MEASURING.includes(state);
}
export function isApprovedState(state: InterventionState): boolean {
  return APPROVED.includes(state) || state === "draft" || state === "awaiting_approval";
}
export function isHoldingState(state: InterventionState): boolean {
  return HOLDING.includes(state);
}

/** The outcome word on a record: the verdict once the window closed, the state while it is open. */
export function outcomeWord(iv: Pick<InterventionEval, "state" | "result">): string {
  return iv.result.outcome === "pending" ? (IV_STATE_LABEL[iv.state] ?? iv.state) : iv.result.label;
}

/** Green when money was minted, red when the record is a failure, otherwise the outcome's own tone. */
export function outcomeTone(iv: Pick<InterventionEval, "state" | "result">): Tone {
  if (iv.result.money) return "book";
  if (iv.state === "guardrail_failed" || iv.state === "reversed" || iv.result.outcome === "negative" || iv.result.outcome === "guardrail_failure" || iv.result.outcome === "reversed") return "bad";
  return toneOfOutcome(iv.result.outcome);
}

/* ---------- the state path --------------------------------------------------- */

export const HAPPY_PATH = ["draft", "approved", "executed", "measuring", "verified", "persistent"] as const;

/** Where a state sits on the happy path, and the failure chip it appends, if any. */
export function pathPosition(state: InterventionState): { index: number; fail: string | null; closed: boolean } {
  switch (state) {
    case "draft":
    case "awaiting_approval":
      return { index: 0, fail: null, closed: false };
    case "approved":
    case "scheduled":
    case "in_progress":
    case "evidence_pending":
      return { index: 1, fail: null, closed: false };
    case "executed":
    case "measurement_pending":
      return { index: 2, fail: null, closed: false };
    case "measuring":
      return { index: 3, fail: null, closed: false };
    case "verified":
    case "persistence_monitoring":
      return { index: 4, fail: null, closed: false };
    case "persistent":
      return { index: 5, fail: null, closed: false };
    case "inconclusive":
    case "failed":
    case "guardrail_failed":
      return { index: 3, fail: IV_STATE_LABEL[state] ?? state, closed: false };
    case "reversed":
      return { index: 4, fail: IV_STATE_LABEL[state] ?? state, closed: false };
    case "decayed":
      return { index: 5, fail: IV_STATE_LABEL[state] ?? state, closed: false };
    case "closed":
      return { index: 5, fail: null, closed: true };
  }
}
