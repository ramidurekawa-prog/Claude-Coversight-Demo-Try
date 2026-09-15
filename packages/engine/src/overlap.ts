/**
 * Overlap engine — System 5. Two claims overlap when their scope (locations,
 * items or labour group), their period and their account intersect.
 * Precedence, in order: explicit human resolution → earliest verified →
 * narrowest scope → strongest method → proportional → unresolved (blocks both).
 */
import type { IsoDate } from "./dates";

export interface OverlapClaim {
  id: string;
  locs: readonly string[];
  account: string;
  period: string;
  amountCents: number;
  items?: readonly string[] | undefined;
  /** Intersection in cents with another claim id, as computed by the caller. */
  intersectionWith?: Readonly<Record<string, number>> | undefined;
  rung?: number | undefined;
  verifiedAt?: IsoDate | null | undefined;
  humanAllocation?: boolean | undefined;
}

export type OverlapState = "none" | "holds" | "reduced" | "unresolved";

export interface OverlapRef {
  id: string;
  rule: string;
  cents: number;
  role?: "reduced by" | "holds against";
}

export interface ResolvedClaim extends OverlapClaim {
  overlapStatus: OverlapState;
  overlapDeductionCents: number;
  overlapRefs: OverlapRef[];
}

export function scopeKey(c: OverlapClaim): string {
  return [[...c.locs].sort().join("+"), c.account, c.period].join("|");
}
export function scopeWidth(c: OverlapClaim): number {
  return c.locs.length * (c.items ? c.items.length : 8);
}

export function resolveOverlaps(claims: readonly OverlapClaim[]): ResolvedClaim[] {
  const out: ResolvedClaim[] = claims.map((c) => ({ ...c, overlapStatus: "none", overlapDeductionCents: 0, overlapRefs: [] }));
  for (let i = 0; i < out.length; i++) {
    for (let j = i + 1; j < out.length; j++) {
      const a = out[i] as ResolvedClaim;
      const b = out[j] as ResolvedClaim;
      if (a.account !== b.account) continue;
      if (!a.locs.some((l) => b.locs.includes(l))) continue;
      if (a.period !== b.period) continue;
      const inter = Math.min(a.intersectionWith?.[b.id] ?? b.intersectionWith?.[a.id] ?? 0, a.amountCents, b.amountCents);
      if (!inter) continue;
      let winner: ResolvedClaim;
      let rule: string;
      if (a.humanAllocation || b.humanAllocation) {
        winner = a.humanAllocation ? a : b;
        rule = "1 · Explicit human resolution";
      } else if (a.verifiedAt && b.verifiedAt) {
        winner = a.verifiedAt <= b.verifiedAt ? a : b;
        rule = "2 · Earliest verified claim";
      } else if (scopeWidth(a) !== scopeWidth(b)) {
        winner = scopeWidth(a) < scopeWidth(b) ? a : b;
        rule = "3 · Narrowest scope";
      } else if ((a.rung ?? 9) !== (b.rung ?? 9)) {
        winner = (a.rung ?? 9) < (b.rung ?? 9) ? a : b;
        rule = "4 · Strongest method";
      } else if (a.amountCents && b.amountCents) {
        const ta = a.amountCents / (a.amountCents + b.amountCents);
        const da = Math.round(inter * (1 - ta));
        const db = inter - da;
        a.overlapDeductionCents += da;
        b.overlapDeductionCents += db;
        a.overlapStatus = "reduced";
        b.overlapStatus = "reduced";
        rule = "5 · Proportional allocation";
        a.overlapRefs.push({ id: b.id, rule, cents: da });
        b.overlapRefs.push({ id: a.id, rule, cents: db });
        continue;
      } else {
        a.overlapStatus = "unresolved";
        b.overlapStatus = "unresolved";
        rule = "— · Unresolved";
        a.overlapRefs.push({ id: b.id, rule, cents: inter });
        b.overlapRefs.push({ id: a.id, rule, cents: inter });
        continue;
      }
      const loser = winner === a ? b : a;
      loser.overlapDeductionCents += inter;
      loser.overlapStatus = "reduced";
      winner.overlapStatus = winner.overlapStatus === "none" ? "holds" : winner.overlapStatus;
      loser.overlapRefs.push({ id: winner.id, rule, cents: inter, role: "reduced by" });
      winner.overlapRefs.push({ id: loser.id, rule, cents: inter, role: "holds against" });
    }
  }
  return out;
}
