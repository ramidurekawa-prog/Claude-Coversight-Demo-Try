/**
 * From an accepted finding to a frozen intervention record (Doctrine 4): the
 * plan is written BEFORE execution and never edited after. The applied change
 * is what the synthetic register applies when the demo clock advances; a real
 * register would simply show the change.
 */
import type { IsoDate } from "./dates";
import type { AppliedChange, InterventionDecl, MeasurementPlan } from "./interventions";
import type { LedgerFinding } from "./ledger";
import type { Location } from "./register";
import { leverMeta } from "./registry";

export interface ProposalOptions {
  id: string;
  owner: string;
  approver: string;
  approvalTier?: "Operator" | "Owner";
  decidedOn: IsoDate;
  /** Planned execution date (the action's due date). */
  dueOn: IsoDate;
  locations: readonly Location[];
  /** For a purchasing lever: the comparison SKUs (same vendor, not re-quoted). */
  controlSkus?: readonly string[];
}

const PERSISTENCE = "Day 28, 60, 90, then quarterly";
const EXCLUSIONS = "Closures, holidays and any service with a POS outage";

function num(x: unknown, fallback = 0): number {
  return typeof x === "number" && Number.isFinite(x) ? x : fallback;
}

export function proposeIntervention(f: LedgerFinding, o: ProposalOptions): InterventionDecl {
  const meta = leverMeta(f.lever);
  const others = o.locations.map((l) => l.id).filter((id) => id !== f.loc);
  const otherNames = o.locations.filter((l) => others.includes(l.id)).map((l) => l.short);
  const room = o.locations.find((l) => l.id === f.loc)?.short ?? f.loc;
  const dp = f.daypart ? [f.daypart] : undefined;
  const x = f.extra ?? {};

  const base = {
    id: o.id,
    findingId: f.id,
    title: f.title,
    lever: f.lever,
    family: f.family,
    domain: f.domain,
    loc: f.loc,
    locs: f.locs,
    daypart: f.daypart,
    dows: f.dow != null ? [f.dow] : undefined,
    account: f.account,
    autonomy: f.autonomy,
    hypothesis: f.plain,
    change: f.remedy.change,
    notChanging: `Everything else at ${room}, and every service at ${otherNames.join(" and ") || "the other rooms"}.`,
    owner: o.owner,
    approver: o.approver,
    approvalTier: o.approvalTier ?? (f.recoverableCents >= 25000 ? "Owner" : "Operator"),
    decidedOn: o.decidedOn,
    execOn: o.dueOn,
    executionFidelity: "not_started" as const,
    evidence: [],
    incrementalCostCents: 0,
    rung: 2,
    projectedCents: f.recoverableCents,
    lifecycleState: "approved" as const,
    overlapStatus: f.overlapStatus,
    overlapDeductionCents: f.overlapDeductionCents,
  };

  const plan = (p: Partial<MeasurementPlan> & Pick<MeasurementPlan, "primary" | "unit" | "comparison">): MeasurementPlan => ({
    baselineDays: 56,
    windowDays: 28,
    minObservations: 4,
    preferredObservations: 4,
    latencyDays: f.remedy.latencyDays > 7 ? 7 : 0,
    guardrails: f.guardrails.length ? f.guardrails : meta.guardrails,
    rung: 2,
    confounders: ["Seasonality", "Day of week", "Local events", "Staffing disruption"],
    exclusions: EXCLUSIONS,
    z: "one-sided 95%",
    stop: "Any guardrail breach, or a data-quality failure on the feeds this measurement reads",
    persistence: PERSISTENCE,
    ...p,
  });

  switch (f.lever) {
    case "comps": {
      const applied: AppliedChange = { kind: "comps_rate", loc: f.loc, daypart: f.daypart ?? undefined, from: o.dueOn, value: -num(x.excessRate) };
      return { ...base, plan: plan({ primary: "Comps cents per cover, weekly", unit: "location-daypart-week", comparison: `${f.daypart ?? "All"} services at ${otherNames.join(" and ")}, which did not change their threshold` }), treatScope: { locs: [f.loc], dayparts: dp }, controlScope: { locs: others, dayparts: dp }, metricKey: "comps_per_cover", grain: "cover", direction: "down_is_saving", weekly: true, estimator: "did", appliedChange: applied };
    }
    case "labour_hours": {
      const cut = num(x.cutHours, Math.round(num(x.deltaHours) * 0.75));
      const applied: AppliedChange = { kind: "labour_hours", loc: f.loc, daypart: f.daypart ?? undefined, dows: f.dow != null ? [f.dow] : undefined, from: o.dueOn, value: cut };
      if (f.dow != null) {
        const ctrlDows = [1, 2, 3, 4].filter((d) => d !== f.dow);
        return { ...base, plan: plan({ primary: `Paid labour cost per cover, ${f.daypart ?? "service"}`, unit: "shift", comparison: `The other weekday ${f.daypart ?? ""} services at the same room`, stop: "Ticket time above +1.5 min, rating below −0.15, or net sales down more than 3%" }), treatScope: { locs: [f.loc], dayparts: dp, dows: [f.dow] }, controlScope: { locs: [f.loc], dayparts: dp, dows: ctrlDows }, metricKey: "labour_per_cover", grain: "cover", direction: "down_is_saving", weekly: false, estimator: "did", appliedChange: applied };
      }
      return { ...base, plan: plan({ primary: "Paid labour cost per cover, weekly", unit: "location-daypart-week", comparison: `${f.daypart ?? "All"} services at ${otherNames.join(" and ")}`, stop: "Ticket time above +1.5 min or rating below −0.15 — reverse immediately" }), treatScope: { locs: [f.loc], dayparts: dp }, controlScope: { locs: others, dayparts: dp }, metricKey: "labour_per_cover", grain: "cover", direction: "down_is_saving", weekly: true, estimator: "did", appliedChange: applied };
    }
    case "purchasing": {
      const p0 = num(x.p0);
      const p1 = num(x.p1, p0);
      const applied: AppliedChange = { kind: "sku_price", sku: f.sku, from: o.dueOn, value: p1 > 0 ? p0 / p1 : 1 };
      return { ...base, plan: plan({ primary: "Unit price per unit on subsequent invoices", unit: "sku-week", comparison: "The same vendor's other SKUs, which were not re-quoted", guardrails: ["comps", "rating"], confounders: ["Supplier changes", "Seasonality", "Promotions", "Price changes"], exclusions: "Any week with a credit memo or a short delivery", stop: "A quality complaint traced to the SKU, or a stockout" }), treatSku: f.sku, controlSkus: [...(o.controlSkus ?? [])], metricKey: "sku_unit_price", grain: "sku", direction: "down_is_saving", weekly: false, estimator: "reconcile", appliedChange: applied };
    }
    case "portion": {
      const r0 = num(x.ratioBase, 1);
      const r1 = num(x.ratioNow, r0);
      const applied: AppliedChange = { kind: "portion", sku: f.sku, loc: f.loc, from: o.dueOn, value: r1 > 0 ? r0 / r1 : 1 };
      return { ...base, plan: plan({ primary: "Usage per plate sold, priced at the unit price frozen at execution", unit: "sku-week", baselineDays: 84, comparison: `The same SKU at ${otherNames.join(" and ")}, which did not change the station`, guardrails: ["rating", "covers"], confounders: ["Supplier changes", "Seasonality", "Menu changes", "Staffing disruption"], persistence: "Day 28, 60, 90 — this lever is expected to need upkeep" }), treatSku: f.sku, treatScope: { locs: [f.loc] }, controlScope: { locs: others }, metricKey: "sku_cost_per_plate", grain: "sku_unit", direction: "down_is_saving", weekly: false, estimator: "did", appliedChange: applied };
    }
    case "menu_price": {
      const applied: AppliedChange = { kind: "price", item: f.items?.[0], loc: f.loc, from: o.dueOn, value: Math.round(f.observed.baseline) };
      return { ...base, plan: plan({ primary: "Contribution margin per cover, weekly", unit: "location-week", latencyDays: 7, comparison: `${otherNames.join(" and ")}, where the price did not move`, guardrails: ["covers", "check_average", "net_sales"], confounders: ["Seasonality", "Promotions", "Menu changes", "Local events"] }), treatScope: { locs: [f.loc] }, controlScope: { locs: others }, metricKey: "cm_per_cover", grain: "cover", direction: "up_is_saving", weekly: true, estimator: "did", appliedChange: applied };
    }
    case "ticket_time": {
      const applied: AppliedChange = { kind: "ticket", loc: f.loc, daypart: f.daypart ?? undefined, from: o.dueOn, value: -num(x.deltaMin) * 0.5 };
      return { ...base, plan: plan({ primary: "Contribution margin per cover, weekly", unit: "location-daypart-week", latencyDays: 3, comparison: `${f.daypart ?? "All"} services at ${otherNames.join(" and ")}`, guardrails: ["ticket_time", "rating", "overtime"], confounders: ["Seasonality", "Day of week", "Menu changes", "Equipment outages"] }), treatScope: { locs: [f.loc], dayparts: dp }, controlScope: { locs: others, dayparts: dp }, metricKey: "cm_per_cover", grain: "cover", direction: "up_is_saving", weekly: true, estimator: "did", appliedChange: applied };
    }
    default: {
      // mix_shift: a placement change; the register carries no mechanical effect to apply.
      const applied: AppliedChange = { kind: "none", loc: f.loc, from: o.dueOn, value: 0 };
      return { ...base, plan: plan({ primary: "Contribution margin per cover, weekly", unit: "location-week", latencyDays: 7, comparison: `${otherNames.join(" and ")}, where the menu did not change`, guardrails: ["covers", "net_sales"], confounders: ["Seasonality", "Promotions", "Menu changes"] }), treatScope: { locs: [f.loc] }, controlScope: { locs: others }, metricKey: "cm_per_cover", grain: "cover", direction: "up_is_saving", weekly: true, estimator: "did", appliedChange: applied };
    }
  }
}
