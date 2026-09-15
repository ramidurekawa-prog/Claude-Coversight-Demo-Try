/**
 * Today — System 7. Eleven card types, one next action each, ranked by
 * consequence of inaction (versioned policy), never by value. An empty queue
 * is a valid state.
 */
import { formatDate, type IsoDate } from "./dates";
import { plainOutcome } from "./copy";
import type { Adjustment, LedgerAction, LedgerFinding } from "./ledger";
import { inScope } from "./ledger";
import type { InterventionEval } from "./interventions";
import { formatPct } from "./money";
import type { FeedHealth } from "./register";

export type CardType = "action_due" | "high_value" | "missing_evidence" | "window_eligible" | "verification_exception" | "guardrail" | "data_quality" | "persistence" | "reversal" | "recon_question" | "overlap";

export const CARD_TYPES: Record<CardType, { label: string; act: string; who: string; rank: number }> = {
  guardrail: { label: "Guardrail violations", act: "Pause, reverse, or accept with reason", who: "Operator, owner-tier for reversal", rank: 1 },
  data_quality: { label: "Data-quality failures", act: "Reconnect, backfill, or quarantine", who: "Admin plus operator", rank: 2 },
  overlap: { label: "Overlap conflicts", act: "Allocate, or split", who: "Operator", rank: 2 },
  verification_exception: { label: "Verification exceptions", act: "Open the packet", who: "Operator or admin", rank: 3 },
  reversal: { label: "Interventions requiring reversal", act: "Approve the reversal plan", who: "Owner tier", rank: 3 },
  missing_evidence: { label: "Missing execution evidence", act: "Attach evidence, or mark not executed", who: "Owner", rank: 4 },
  action_due: { label: "Actions due", act: "Mark done with evidence", who: "Owner", rank: 5 },
  high_value: { label: "High-value findings awaiting decision", act: "Accept, reject with reason, or ask for more data", who: "Operator", rank: 6 },
  window_eligible: { label: "Tests reaching measurement eligibility", act: "Confirm the window may close", who: "System, operator confirms", rank: 7 },
  persistence: { label: "Savings losing persistence", act: "Investigate, or accept the adjustment", who: "Operator", rank: 8 },
  recon_question: { label: "Accountant reconciliation questions", act: "Answer, or route to the accountant", who: "Finance", rank: 9 },
};

export const QUEUE_POLICY_VERSION = "ranking policy v1.0 — consequence of inaction";

export interface QueueCard {
  id: string;
  type: CardType;
  label: string;
  act: string;
  who: string;
  rank: number;
  title: string;
  body: string;
  ref: { kind: "finding" | "intervention" | "action" | "feed" | "adjustment"; id: string };
  loc: string;
  moneyCents?: number | null;
  moneyClass?: "recoverable" | "committed" | null;
  dueOn?: IsoDate | null;
  overdue?: boolean;
}

export interface QueueInput {
  findings: LedgerFinding[];
  interventions: InterventionEval[];
  actions: LedgerAction[];
  adjustments: Adjustment[];
  feeds: FeedHealth[];
  locs: string[];
  asOf: IsoDate;
}

export function queue(input: QueueInput): QueueCard[] {
  const cards: QueueCard[] = [];
  const push = (type: CardType, o: Omit<QueueCard, "type" | "label" | "act" | "who" | "rank">) => cards.push({ type, ...CARD_TYPES[type], ...o });

  for (const iv of input.interventions.filter((iv) => inScope(iv, input.locs))) {
    if (iv.result.outcome === "guardrail_failure") {
      push("guardrail", { id: `Q-${iv.id}`, title: `We stopped: ${iv.title}`, body: plainOutcome(iv), ref: { kind: "intervention", id: iv.id }, loc: iv.loc });
      if (iv.state === "guardrail_failed") push("reversal", { id: `QR-${iv.id}`, title: `Reversal plan for ${iv.title}`, body: "Nothing was ever booked against this intervention, so there is no credit implication. The reversal restores the prior standard and drops that lever to A0 at this room.", ref: { kind: "intervention", id: iv.id }, loc: iv.loc });
    }
    if (iv.persistence && iv.persistence.status === "decaying") {
      push("persistence", { id: `QP-${iv.id}`, title: `${iv.title} is below its persistence threshold`, body: `Retention is ${formatPct(iv.persistence.retention ?? 0, 0)} of the verified rate after ${iv.persistence.elapsedWeeks} weeks; half-life ${(iv.persistence.halfLifeWeeks ?? 0).toFixed(1)} weeks. The upkeep action is on the plan before the value disappears, not after.`, ref: { kind: "intervention", id: iv.id }, loc: iv.loc });
    }
    if (iv.state === "measuring") {
      push("window_eligible", { id: `QW-${iv.id}`, title: `${iv.title} — result on ${formatDate(iv.eligibleOn)}`, body: `Executed ${formatDate(iv.execOn)}. ${iv.observed} of ${iv.observedOf} comparable services observed. ${iv.guardrailResults.every((g) => g.passed) ? "Guardrails healthy." : "A guardrail is moving."}`, ref: { kind: "intervention", id: iv.id }, loc: iv.loc, moneyCents: iv.projectedCents, moneyClass: "committed" });
    }
    if (iv.state === "evidence_pending" || (iv.state === "in_progress" && iv.execOn < input.asOf)) {
      push("missing_evidence", { id: `QE-${iv.id}`, title: `${iv.title} — was it done?`, body: `Scheduled for ${formatDate(iv.execOn)}. No execution evidence has been attached, so the measurement clock has not started.`, ref: { kind: "intervention", id: iv.id }, loc: iv.loc });
    }
    if (iv.result.outcome === "data_failure" || iv.result.outcome === "attribution_conflict") {
      push("verification_exception", { id: `QV-${iv.id}`, title: `${iv.title} — ${iv.result.label}`, body: iv.result.why, ref: { kind: "intervention", id: iv.id }, loc: iv.loc });
    }
  }
  for (const a of input.adjustments.filter((a) => a.kind === "Dispute" && a.status === "open")) {
    push("recon_question", { id: `QC-${a.id}`, title: a.title, body: a.reason, ref: { kind: "adjustment", id: a.id }, loc: a.loc });
  }
  const seenOverlap = new Set<string>();
  for (const f of input.findings.filter((f) => inScope(f, input.locs) && !f.historical)) {
    if (f.state === "awaiting_decision") push("high_value", { id: `QF-${f.id}`, title: f.title, body: f.plain, ref: { kind: "finding", id: f.id }, loc: f.loc, moneyCents: f.recoverableCents, moneyClass: "recoverable" });
    if (f.state === "data_insufficient" && f.blockedBy) push("data_quality", { id: `QD-${f.id}`, title: `${f.title} — blocked`, body: f.blockedBy.why, ref: { kind: "finding", id: f.id }, loc: f.loc });
    if ((f.overlapStatus === "reduced" || f.overlapStatus === "unresolved") && !["converted", "rejected", "superseded"].includes(f.state)) {
      const key = [f.id, ...f.overlapRefs.map((r) => r.id)].sort().join("+");
      if (!seenOverlap.has(key)) {
        seenOverlap.add(key);
        push("overlap", { id: `QO-${f.id}`, title: `Two claims, one dollar — ${f.title}`, body: f.overlapNote ?? "These claims intersect on scope, period and account.", ref: { kind: "finding", id: f.id }, loc: f.loc });
      }
    }
  }
  for (const feed of input.feeds) {
    if (feed.stale && feed.tier !== "Later") push("data_quality", { id: `QS-${feed.id}`, title: `${feed.name} has not refreshed since ${formatDate(feed.newest)}`, body: feed.degraded, ref: { kind: "feed", id: feed.id }, loc: "group" });
  }
  for (const a of input.actions.filter((a) => a.state === "open" && inScope({ loc: a.loc }, input.locs))) {
    const overdue = a.dueOn < input.asOf;
    push("action_due", { id: `QA-${a.id}`, title: a.title, body: `${a.owner} · due ${formatDate(a.dueOn)}${overdue ? " · overdue" : ""}`, ref: { kind: "action", id: a.id }, loc: a.loc, dueOn: a.dueOn, overdue });
  }
  return cards.sort((a, b) => a.rank - b.rank || (b.moneyCents ?? 0) - (a.moneyCents ?? 0) || a.id.localeCompare(b.id));
}
