/**
 * Every value the engine produces for the Rosewood build must cross the
 * contracts boundary unchanged. The build is JSON-round-tripped first, the way
 * a response travels, so Money serialises to { cents, klass } and any
 * non-finite number shows up the way the browser will see it.
 */
import { accrual, accrualInPeriod, bridge, confidenceWord, conversions, feedRisk, findingConfidence, funnel, interventionConfidence, kpis, queue, type LedgerInput } from "@streamline/engine";
import { buildHarbor, buildRosewood } from "@streamline/fixture";
import * as C from "@streamline/contracts";
import type { z } from "zod";
import { describe, expect, it } from "vitest";

const b = buildRosewood();
const wire = <T>(x: T): unknown => JSON.parse(JSON.stringify(x));

/** Parse must be lossless: a key the schema does not know is stripped silently, so the output must deep-equal the input. */
function assertParses<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const json = wire(value);
  const r = schema.safeParse(json);
  expect(r.success, `${label}: ${r.success ? "" : JSON.stringify(r.error.issues, null, 2)}`).toBe(true);
  const data = (r as { data: T }).data;
  expect(data, `${label}: parse dropped or altered a field`).toEqual(json);
  return data;
}

const input: LedgerInput = {
  findings: b.findings,
  interventions: b.interventions,
  actions: b.actions,
  adjustments: b.adjustments,
  feeds: b.feeds,
  locations: b.register.locations,
  scope: "all",
  feeMonthlyCents: b.org.feeMonthlyCents,
  asOf: b.asOf,
  period: b.period,
  ledgerSides: b.ledgerSides,
};
const scopes = ["all", ...b.register.locations.map((l) => l.id)];

describe("engine records round-trip through the contracts", () => {
  it("has something to test", () => {
    expect(b.findings.length).toBeGreaterThan(0);
    expect(b.interventions.length).toBe(10);
  });

  it.each(b.findings.map((f) => [f.id, f] as const))("LedgerFinding %s", (_id, f) => {
    const parsed = assertParses(C.LedgerFinding, f, f.id);
    expect(parsed.exposureCents).toBe(f.exposureCents);
    expect(parsed.state).toBe(f.state);
  });

  it.each(b.interventions.map((iv) => [iv.id, iv] as const))("InterventionEval %s", (_id, iv) => {
    const parsed = assertParses(C.InterventionEval, iv, iv.id);
    expect(parsed.result.outcome).toBe(iv.result.outcome);
    expect(parsed.result.money?.cents ?? null).toBe(iv.result.money?.cents ?? null);
  });

  it("Adjustment, LedgerAction, FeedHealth, Location, LedgerSide, Period", () => {
    for (const a of b.adjustments) assertParses(C.Adjustment, a, a.id);
    for (const a of b.actions) assertParses(C.LedgerAction, a, a.id);
    for (const f of b.feeds) assertParses(C.FeedHealth, f, f.id);
    for (const l of b.register.locations) assertParses(C.Location, l, l.id);
    for (const [id, side] of Object.entries(b.ledgerSides)) assertParses(C.LedgerSide, side, `ledgerSide ${id}`);
    assertParses(C.Period, b.period, "period");
    assertParses(C.Period, b.closedPeriod, "closedPeriod");
  });

  it.each(scopes)("Kpi, FunnelStage, ConversionMetric, Accrual, FeedRisk at scope %s", (scope) => {
    const scoped = { ...input, scope };
    const ks = kpis(scoped);
    expect(ks).toHaveLength(16);
    for (const k of ks) {
      const parsed = assertParses(C.Kpi, k, `kpi ${k.id}@${scope}`);
      if (typeof k.value === "number") expect(parsed.value).toBe(k.value);
      else expect(parsed.value).toEqual({ cents: k.value.cents, klass: k.value.klass });
    }
    for (const s of funnel(scoped)) assertParses(C.FunnelStage, s, `funnel ${s.stage}@${scope}`);
    for (const c of conversions(scoped)) assertParses(C.ConversionMetric, c, `conversion ${c.id}@${scope}`);
    assertParses(C.Accrual, accrual(scoped), `accrual@${scope}`);
    for (const r of feedRisk(scoped)) assertParses(C.FeedRisk, r, `feedRisk ${r.feedId}@${scope}`);
  });

  it("QueueCard for every card in the queue", () => {
    const cards = queue({ findings: b.findings, interventions: b.interventions, actions: b.actions, adjustments: b.adjustments, feeds: b.feeds, locs: b.register.locations.map((l) => l.id), asOf: b.asOf });
    expect(cards.length).toBeGreaterThan(0);
    for (const c of cards) assertParses(C.QueueCard, c, `card ${c.id}`);
  });

  it("ConfidenceProfile and ConfWord for every finding and intervention", () => {
    for (const f of b.findings) {
      const p = findingConfidence(f, b.feeds);
      assertParses(C.ConfidenceProfile, p, `findingConfidence ${f.id}`);
      assertParses(C.ConfWord, confidenceWord(p), `confidenceWord ${f.id}`);
    }
    for (const iv of b.interventions) {
      const side = b.ledgerSides[iv.id];
      const p = interventionConfidence(iv, side ? { status: side.status, note: side.explanation } : null);
      assertParses(C.ConfidenceProfile, p, `interventionConfidence ${iv.id}`);
      assertParses(C.ConfWord, confidenceWord(p), `confidenceWord ${iv.id}`);
    }
  });

  it("Bridge for every reconciled claim in the closed period", () => {
    const ids = Object.keys(b.ledgerSides);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      const iv = b.interventions.find((x) => x.id === id);
      const side = b.ledgerSides[id];
      if (!iv || !side) throw new Error(`missing ${id}`);
      assertParses(C.Bridge, bridge(iv, accrualInPeriod(iv, b.closedPeriod, b.asOf), side), `bridge ${id}`);
    }
  });

  it("the second tenant's feeds, locations and baseline", () => {
    const h = buildHarbor();
    for (const f of h.feeds) assertParses(C.FeedHealth, f, `harbor feed ${f.id}`);
    for (const l of h.locations) assertParses(C.Location, l, `harbor location ${l.id}`);
    assertParses(C.BaselineProgress, h.baseline, "harbor baseline");
  });
});
