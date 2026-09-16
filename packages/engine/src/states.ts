/**
 * State machines — System 8 (findings, eleven states) and System 9
 * (interventions, eighteen states, two forbidden edges). Illegal transitions
 * are refused with a reason. `verified` is writable only out of `measuring`,
 * by the verification decision service.
 */

export type FindingState =
  | "detected"
  | "investigating"
  | "data_insufficient"
  | "qualified"
  | "awaiting_decision"
  | "accepted"
  | "rejected"
  | "superseded"
  | "converted"
  | "expired"
  | "invalidated";

export interface StateSpec {
  label: string;
  meaning: string;
  setBy: string;
  exit: string;
  terminal: boolean;
}

export const FINDING_STATES: Record<FindingState, StateSpec> = {
  detected: { label: "Detected", meaning: "A detector fired and the finding exists.", setBy: "Automatic", exit: "Ages out at the expiry date if nothing happens.", terminal: false },
  investigating: { label: "Under investigation", meaning: "A diagnostic pass is running, or a human has parked the decision while the world answers.", setBy: "Agent or operator", exit: "Resolves back to a decision, to qualified, or to one of the endings.", terminal: false },
  data_insufficient: { label: "Data insufficient", meaning: "Evidence is below the threshold required to size it honestly.", setBy: "System", exit: "Terminal until the data gap is closed; re-detection creates a new finding.", terminal: true },
  qualified: { label: "Qualified", meaning: "It passed data, feasibility, recoverability and overlap tests.", setBy: "System, deterministic", exit: "The first state at which a recoverable figure may be shown.", terminal: false },
  awaiting_decision: { label: "Awaiting decision", meaning: "Presented to a human with a recommendation.", setBy: "System", exit: "Expires if no decision is made inside the window.", terminal: false },
  accepted: { label: "Accepted", meaning: "The operator agreed to act.", setBy: "Operator", exit: "Must convert to an action or return to awaiting decision.", terminal: false },
  rejected: { label: "Rejected", meaning: "The operator declined, with a reason code.", setBy: "Operator", exit: "Terminal. The reason is a training label.", terminal: true },
  superseded: { label: "Superseded", meaning: "Another finding covers the same dollars better.", setBy: "Overlap engine", exit: "Terminal, with a reference to the winner.", terminal: true },
  converted: { label: "Converted to action", meaning: "An action and, where applicable, an intervention exist.", setBy: "System", exit: "Leaves the finding lifecycle; the action lifecycle takes over.", terminal: false },
  expired: { label: "Expired", meaning: "No decision inside the decision window.", setBy: "System", exit: "Terminal. A high expiry rate is a product problem, not an operator problem.", terminal: true },
  invalidated: { label: "Invalidated", meaning: "The detection was wrong — bad data, bad mapping, bad rule.", setBy: "Operator or system", exit: "Terminal, and it feeds detector precision measurement.", terminal: true },
};

export const FINDING_TRANSITIONS: Record<FindingState, FindingState[]> = {
  detected: ["investigating", "qualified", "data_insufficient", "invalidated", "expired", "superseded", "awaiting_decision"],
  // A decision can be parked pending an external answer (a vendor re-quote, a corrected
  // reading) and later resume where it left off — the only reason "investigating" is
  // reachable from, and returns to, awaiting_decision rather than only from "detected".
  investigating: ["qualified", "awaiting_decision", "data_insufficient", "invalidated", "superseded"],
  qualified: ["awaiting_decision", "superseded", "invalidated", "expired"],
  awaiting_decision: ["accepted", "rejected", "investigating", "expired", "superseded", "invalidated"],
  accepted: ["converted", "awaiting_decision"],
  converted: [],
  rejected: [],
  superseded: [],
  expired: [],
  invalidated: [],
  data_insufficient: [],
};

export function canFindingTransition(from: FindingState, to: FindingState): { ok: boolean; why?: string } {
  if (!(FINDING_TRANSITIONS[from] ?? []).includes(to)) return { ok: false, why: `No edge from ${FINDING_STATES[from].label} to ${FINDING_STATES[to].label} in the finding transition table.` };
  return { ok: true };
}

/** The states in which a finding is open (not terminal, not converted). */
export const OPEN_FINDING_STATES: FindingState[] = ["detected", "investigating", "qualified", "awaiting_decision", "accepted"];

export type RejectionCode = "seasonal_not_negotiable" | "already_addressed" | "service_risk" | "not_worth_effort" | "wrong_root_cause" | "other";
export const REJECT_CODES: Array<{ code: RejectionCode; label: string }> = [
  { code: "seasonal_not_negotiable", label: "Seasonal — the vendor will not hold a price" },
  { code: "already_addressed", label: "Already being addressed outside the product" },
  { code: "service_risk", label: "Operationally too risky to service" },
  { code: "not_worth_effort", label: "Not worth the operator time" },
  { code: "wrong_root_cause", label: "The stated cause is wrong" },
  { code: "other", label: "Other (reason required)" },
];

/* ---------- interventions --------------------------------------------------- */

export type InterventionState =
  | "draft"
  | "awaiting_approval"
  | "approved"
  | "scheduled"
  | "in_progress"
  | "evidence_pending"
  | "executed"
  | "measurement_pending"
  | "measuring"
  | "inconclusive"
  | "failed"
  | "guardrail_failed"
  | "verified"
  | "persistence_monitoring"
  | "persistent"
  | "decayed"
  | "reversed"
  | "closed";

export interface IvStateSpec {
  label: string;
  meaning: string;
  kind: "forward" | "failure";
}

export const IV_STATES: Record<InterventionState, IvStateSpec> = {
  draft: { label: "Draft", meaning: "Created, incomplete, invisible outside the workspace.", kind: "forward" },
  awaiting_approval: { label: "Awaiting approval", meaning: "Complete and routed to the approver named by its risk tier.", kind: "forward" },
  approved: { label: "Approved", meaning: "Approved with scope and expiry. The measurement plan is now frozen.", kind: "forward" },
  scheduled: { label: "Scheduled", meaning: "Start date set, not yet begun.", kind: "forward" },
  in_progress: { label: "In progress", meaning: "The change is being made.", kind: "forward" },
  evidence_pending: { label: "Execution evidence pending", meaning: "Claimed complete; evidence not yet attached or not yet resolved.", kind: "forward" },
  executed: { label: "Executed", meaning: "Evidence resolved against stored records. The measurement clock starts here, not at approval.", kind: "forward" },
  measurement_pending: { label: "Measurement pending", meaning: "Executed, waiting for the window to accumulate.", kind: "forward" },
  measuring: { label: "Measuring", meaning: "Inside the measurement window; guardrails monitored live.", kind: "forward" },
  inconclusive: { label: "Inconclusive", meaning: "Window closed, no conclusion — insufficient power, failed parallel trends, or no valid control.", kind: "failure" },
  failed: { label: "No measurable effect", meaning: "Measured, no effect, or an effect in the wrong direction.", kind: "failure" },
  guardrail_failed: { label: "Guardrail failed", meaning: "A real primary effect, but a guardrail breach. No savings, full record retained.", kind: "failure" },
  verified: { label: "Verified", meaning: "Passed every gate. A bookable claim exists.", kind: "forward" },
  persistence_monitoring: { label: "Persistence monitoring", meaning: "Verified and inside its persistence schedule.", kind: "forward" },
  persistent: { label: "Persistent", meaning: "Passed its most recent persistence check.", kind: "forward" },
  decayed: { label: "Decayed", meaning: "Held, then stopped holding. The claim ends at the last date it held.", kind: "failure" },
  reversed: { label: "Reversed", meaning: "The claim is withdrawn; a credit or adjustment is issued.", kind: "failure" },
  closed: { label: "Closed", meaning: "Terminal. The learning record is written and the intervention is immutable.", kind: "forward" },
};

export const IV_TRANSITIONS: Record<InterventionState, InterventionState[]> = {
  draft: ["awaiting_approval"],
  awaiting_approval: ["approved", "draft"],
  approved: ["scheduled", "draft"],
  scheduled: ["in_progress", "approved"],
  in_progress: ["evidence_pending"],
  evidence_pending: ["executed", "in_progress"],
  executed: ["measurement_pending"],
  measurement_pending: ["measuring"],
  measuring: ["inconclusive", "failed", "guardrail_failed", "verified"],
  verified: ["persistence_monitoring", "reversed"],
  persistence_monitoring: ["persistent", "decayed", "reversed"],
  persistent: ["persistence_monitoring", "decayed", "reversed", "closed"],
  decayed: ["closed", "persistence_monitoring"],
  reversed: ["closed"],
  inconclusive: ["closed", "draft"],
  failed: ["closed"],
  guardrail_failed: ["reversed", "closed"],
  closed: [],
};

/** The two edges the machine exists to forbid. */
export const FORBIDDEN_EDGES: Array<{ from: InterventionState; to: InterventionState; why: string }> = [
  { from: "approved", to: "verified", why: "A recommendation may never become verified." },
  { from: "executed", to: "verified", why: "Execution alone never verifies anything — the window must close and the service must decide." },
];

export function canInterventionTransition(from: InterventionState, to: InterventionState): { ok: boolean; why?: string } {
  const forbidden = FORBIDDEN_EDGES.find((e) => e.from === from && e.to === to);
  if (forbidden) return { ok: false, why: forbidden.why };
  if (!(IV_TRANSITIONS[from] ?? []).includes(to)) return { ok: false, why: `No edge from ${IV_STATES[from].label} to ${IV_STATES[to].label} in the transition table.` };
  if (to === "verified" && from !== "measuring") return { ok: false, why: "verified is writable only out of measuring, by the verification decision service." };
  return { ok: true };
}

export class IllegalTransitionError extends Error {
  constructor(
    readonly from: string,
    readonly to: string,
    why: string,
  ) {
    super(`illegal transition ${from} → ${to}: ${why}`);
    this.name = "IllegalTransitionError";
  }
}

/** Interventions counted as "in flight" — executing or measuring. */
export const IN_FLIGHT_STATES: InterventionState[] = ["approved", "scheduled", "in_progress", "evidence_pending", "executed", "measurement_pending", "measuring"];
/** Interventions whose window closed with a bookable claim that still stands. */
export const CLAIM_STATES: InterventionState[] = ["verified", "persistence_monitoring", "persistent", "decayed"];
