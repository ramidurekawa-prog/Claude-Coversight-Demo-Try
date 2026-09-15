/**
 * The detection pipeline — Doctrine 1 stages 1–3 as one pure pass:
 * detect → resolve overlap → qualify → initial state. Prior lifecycle state
 * (human decisions, conversions, terminal endings) is preserved: re-detection
 * refreshes evidence, never resets a decision.
 */
import { addDays, type IsoDate } from "./dates.js";
import { detectors, evPerHour, qualify, recoverableOf, type FindingCore } from "./detectors.js";
import type { LedgerFinding } from "./ledger.js";
import { formatUsd } from "./money.js";
import { resolveOverlaps, type OverlapClaim } from "./overlap.js";
import type { FeedHealth, Register } from "./register.js";
import { FINDING_STATES, type FindingState } from "./states.js";

export interface PriorFinding {
  state: FindingState;
  stateReason?: string | null;
  /** When absent, the detector's own onset dates the finding. */
  detectedOn?: IsoDate | null;
  decisionOpenedOn?: IsoDate | null;
  expiresOn?: IsoDate | null;
  convertedTo?: string | null;
  rejection?: LedgerFinding["rejection"];
  historical?: boolean;
}

/** Policy: days a qualified finding waits for a decision before it expires (System 8). */
export const DECISION_WINDOW_DAYS = 45;

export interface DetectionPass {
  findings: LedgerFinding[];
  /** Ids that fired this pass. */
  fired: string[];
}

/** Two findings on the same SKU intersect where the over-used pounds are the repriced pounds. */
function skuIntersectionCents(ppv: FindingCore, por: FindingCore): number {
  const step = (ppv.extra?.p1 as number | undefined) ?? 0;
  const base = (ppv.extra?.p0 as number | undefined) ?? 0;
  const excessQty = (por.extra?.excessQtyPerWeek as number | undefined) ?? 0;
  return Math.max(0, Math.round(excessQty * (step - base)));
}

export function runDetectionPass(reg: Register, feeds: readonly FeedHealth[], asOf: IsoDate, prior: ReadonlyMap<string, PriorFinding> = new Map()): DetectionPass {
  const F = detectors(reg, feeds, asOf);

  // Overlap: the same SKU, repriced and over-portioned — counted twice unless allocated.
  const intersections = new Map<string, Record<string, number>>();
  const notes = new Map<string, string>();
  for (const ppv of F.filter((f) => f.detectorCode === "PPV")) {
    for (const por of F.filter((f) => f.detectorCode === "POR" && f.sku === ppv.sku)) {
      const cents = skuIntersectionCents(ppv, por);
      if (!cents) continue;
      intersections.set(ppv.id, { ...(intersections.get(ppv.id) ?? {}), [por.id]: cents });
      intersections.set(por.id, { ...(intersections.get(por.id) ?? {}), [ppv.id]: cents });
      const note = `The over-portioned pounds at ${reg.locations.find((l) => l.id === por.loc)?.short ?? por.loc} are the same pounds the vendor repriced. ${formatUsd(cents)}/wk is in both claims.`;
      notes.set(ppv.id, note);
      notes.set(por.id, note);
    }
  }
  const period = `${asOf.slice(0, 4)}-W${String(Math.ceil((Number(asOf.slice(5, 7)) * 30 + Number(asOf.slice(8, 10))) / 7)).padStart(2, "0")}`;
  const claims: OverlapClaim[] = F.map((f) => ({ id: f.id, locs: f.locs, account: f.account, period, amountCents: f.exposureCents, items: f.items, intersectionWith: intersections.get(f.id), rung: 2 }));
  const resolved = new Map(resolveOverlaps(claims).map((c) => [c.id, c]));

  const out: LedgerFinding[] = [];
  for (const f of F) {
    const r = resolved.get(f.id);
    const overlap = { overlapStatus: r?.overlapStatus ?? ("none" as const), overlapDeductionCents: r?.overlapDeductionCents ?? 0, overlapRefs: r?.overlapRefs ?? [] };
    const qualification = qualify({ ...f, ...overlap }, feeds);
    const recoverableCents = recoverableOf({ ...f, ...overlap });
    const p = prior.get(f.id);
    let state: FindingState;
    let stateReason: string | null = null;
    if (p) {
      state = p.state;
      stateReason = p.stateReason ?? null;
    } else if (f.blockedBy) {
      state = "data_insufficient";
      stateReason = f.blockedBy.why;
    } else if (!qualification.pass) {
      state = qualification.tests.find((t) => !t.pass)?.id === "data" ? "data_insufficient" : "detected";
      stateReason = qualification.tests.filter((t) => !t.pass).map((t) => t.detail).join(" ");
    } else {
      state = "awaiting_decision";
    }
    const detectedOn = p?.detectedOn ?? (f.onset ? f.onset.signalDate : addDays(asOf, -14));
    // The decision window opens when the finding had the evidence to qualify (six observations at
    // its own cadence past onset), never earlier than the day the chart signalled.
    const qualifiedOn = f.onset ? (addDays(f.onset.onsetDate, 6 * f.cadenceDays) > detectedOn ? addDays(f.onset.onsetDate, 6 * f.cadenceDays) : detectedOn) : detectedOn;
    const decisionOpenedOn = p?.decisionOpenedOn ?? (qualifiedOn > asOf ? asOf : qualifiedOn);
    out.push({
      ...f,
      ...overlap,
      overlapNote: notes.get(f.id) ?? null,
      state,
      stateReason,
      recoverableCents,
      qualification,
      detectedOn,
      decisionOpenedOn,
      expiresOn: p?.expiresOn ?? addDays(decisionOpenedOn, DECISION_WINDOW_DAYS),
      effortHours: f.remedy.effort,
      evPerHour: evPerHour(recoverableCents, f.lever, f.remedy.effort),
      convertedTo: p?.convertedTo ?? null,
      rejection: p?.rejection ?? null,
      historical: p?.historical ?? false,
    });
  }
  return { findings: out, fired: F.map((f) => f.id) };
}

/** Expire open findings that passed their decision window without a decision. */
export function expireStale(findings: LedgerFinding[], asOf: IsoDate): LedgerFinding[] {
  return findings.map((f) => (f.state === "awaiting_decision" && f.expiresOn < asOf && !FINDING_STATES[f.state].terminal ? { ...f, state: "expired" as const, stateReason: `No decision inside the ${DECISION_WINDOW_DAYS}-day window.` } : f));
}
