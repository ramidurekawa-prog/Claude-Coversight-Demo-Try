/**
 * Adjustments come OUT of evaluated interventions — reversal, decay — never in.
 * They are append-only in storage: an id, once assigned, keeps its kind and its
 * intervention; new ones are numbered after the last.
 */
import { daysBetween, type IsoDate } from "./dates.js";
import type { InterventionEval } from "./interventions.js";
import type { Adjustment } from "./ledger.js";

export type UnnumberedAdjustment = Omit<Adjustment, "id">;

export function deriveAdjustments(interventions: readonly InterventionEval[], asOf: IsoDate): UnnumberedAdjustment[] {
  const out: UnnumberedAdjustment[] = [];
  for (const iv of interventions) {
    if (iv.reversal && iv.reversedClaimCents != null) {
      out.push({ kind: "Reversal", interventionId: iv.id, title: iv.title, loc: iv.loc, cents: iv.adjustmentCents, status: "credited", reason: iv.reversal.reason, by: iv.reversal.by, on: iv.reversal.on, originalCents: iv.reversedClaimCents, weeks: iv.weeksBooked, note: iv.reversal.creditNote, foundBy: iv.reversal.foundBy });
    }
    if (iv.persistence?.status === "decaying" && iv.result.money) {
      const atRate = Math.round((iv.result.money.cents / 7) * Math.max(0, daysBetween(iv.eligibleOn, asOf)));
      const cents = iv.realizedCents - atRate;
      if (cents < 0) {
        const checkDate = iv.persistenceSeries[iv.persistenceSeries.length - 1]?.date ?? asOf;
        out.push({
          kind: "Decay",
          interventionId: iv.id,
          title: iv.title,
          loc: iv.loc,
          cents,
          status: "accepted",
          reason: `The effect is decaying: retention ${Math.round((iv.persistence.retention ?? 0) * 100)}% of the verified rate after ${iv.persistence.elapsedWeeks ?? 0} weeks, half-life ${(iv.persistence.halfLifeWeeks ?? 0).toFixed(1)} weeks. Accrual follows the measured decay, not the verified rate.`,
          by: "Verification decision service",
          on: checkDate,
          originalCents: atRate,
          weeks: iv.persistence.elapsedWeeks ?? 0,
          note: "An upkeep action is on the plan.",
        });
      }
    }
  }
  return out;
}

/** Stable identity of an adjustment: one reversal, one decay, one dispute per intervention. */
export function adjustmentKey(a: Pick<Adjustment, "kind" | "interventionId">): string {
  return `${a.kind}|${a.interventionId}`;
}

/**
 * Number new adjustments after the existing ones (ADJ-001…). Existing ids are
 * kept by key; a recomputed figure updates the row, never its identity.
 */
export function numberAdjustments(existing: readonly Adjustment[], fresh: readonly UnnumberedAdjustment[]): Adjustment[] {
  const byKey = new Map(existing.map((a) => [adjustmentKey(a), a]));
  const out: Adjustment[] = [];
  let next = existing.reduce((m, a) => Math.max(m, Number(a.id.replace(/^ADJ-/, "")) || 0), 0);
  const sorted = [...fresh].sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : a.interventionId.localeCompare(b.interventionId)));
  for (const a of sorted) {
    const prev = byKey.get(adjustmentKey(a));
    if (prev) out.push({ ...a, id: prev.id });
    else out.push({ ...a, id: `ADJ-${String(++next).padStart(3, "0")}` });
  }
  return out;
}
