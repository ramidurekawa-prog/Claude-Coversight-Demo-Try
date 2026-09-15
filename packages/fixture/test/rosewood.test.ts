import { BANNED_WORDS, recoverableOf, rollupRegister, kpis, type Money, daysBetween } from "@streamline/engine";
import { describe, expect, it } from "vitest";
import { buildRosewood, generateCanonical, registerFingerprint, FIXTURE, HISTORICAL_FINDINGS, SIGNALS, INTERVENTIONS, PERSONAS, buildHarbor, ROSEWOOD_ORG_ID, HARBOR_ORG_ID, LOCATIONS } from "../src/index.js";

/**
 * Pinned to FIXTURE.version. If this fails you changed the generator: bump the
 * version in spec.ts AND update this value in the same commit, so a database
 * seeded from an older fixture is refused rather than silently mixed.
 */
const PINNED = { version: "1.0.0", fingerprint: "2186-1872-2a98013b" };

const b = buildRosewood();
const byId = <T extends { id: string }>(xs: T[], id: string): T => {
  const x = xs.find((v) => v.id === id);
  if (!x) throw new Error(`missing ${id}`);
  return x;
};
const near = (a: string, b: string, days: number) => Math.abs(daysBetween(a, b)) <= days;

describe("Rosewood is deterministic", () => {
  it("builds the same register twice", () => {
    const b2 = buildRosewood();
    expect(registerFingerprint(b2.register)).toBe(registerFingerprint(b.register));
    expect(b2.findings.map((f) => [f.id, f.state, f.exposureCents])).toEqual(b.findings.map((f) => [f.id, f.state, f.exposureCents]));
  });
  it("matches the pinned fingerprint for this fixture version", () => {
    const fp = registerFingerprint(b.register);
    expect(FIXTURE.version).toBe(PINNED.version);
    expect(fp, `generator changed — bump FIXTURE.version and pin ${fp}`).toBe(PINNED.fingerprint);
  });
  it("advancing the clock never rewrites an earlier row", () => {
    const later = rollupRegister(generateCanonical({ through: "2026-10-12" }));
    const cut = (r: typeof later) => r.services.filter((s) => s.date <= "2026-09-14").map((s) => `${s.loc}|${s.date}|${s.daypart}|${s.covers}|${s.netCents}|${s.laborCents}`);
    expect(cut(later)).toEqual(cut(b.register));
    expect(later.services.some((s) => s.date > "2026-09-14")).toBe(true);
  });
});

describe("the detectors find what was planted, and nothing that was not", () => {
  it("dates the live comps rise at Oakland dinner to the week it began", () => {
    const f = byId(b.findings, "F-CMP-OAK-DINNER");
    expect(f.state).toBe("awaiting_decision");
    expect(f.onset && near(f.onset.onsetDate, SIGNALS.compsLive.from, 3)).toBe(true);
    expect(f.exposureCents).toBeGreaterThan(40000);
    expect(f.expiresOn >= b.asOf).toBe(true);
  });
  it("finds the vendor price step and the over-portioning on the same SKU, and allocates the overlap", () => {
    const ppv = byId(b.findings, "F-PPV-SK01");
    const por = byId(b.findings, "F-POR-BRK-SK01");
    expect(ppv.onset && near(ppv.onset.onsetDate, SIGNALS.chickenPriceStep.from, 10)).toBe(true);
    expect(por.onset && near(por.onset.onsetDate, SIGNALS.portionDrift.from, 14)).toBe(true);
    expect(ppv.overlapStatus).toBe("reduced");
    expect(por.overlapStatus).toBe("holds");
    expect(ppv.overlapDeductionCents).toBeGreaterThan(0);
    expect(ppv.overlapRefs[0]?.id).toBe(por.id);
    expect(por.overlapRefs[0]?.id).toBe(ppv.id);
    expect(ppv.recoverableCents).toBe(recoverableOf({ exposureCents: ppv.exposureCents, lever: ppv.lever, overlapDeductionCents: ppv.overlapDeductionCents }));
  });
  it("finds the Tuesday overstaffing at Oakland and the Alameda mix drift", () => {
    const lab = byId(b.findings, "F-LAB-OAK-DINNER-TUE");
    expect(lab.onset && near(lab.onset.onsetDate, SIGNALS.tuesdayOverstaff.from, 14)).toBe(true);
    expect(lab.convertedTo).toBe("IV-07");
    expect(byId(b.findings, "F-MIX-ALA").state).toBe("awaiting_decision");
  });
  it("does not flag the comps DROP at Alameda dinner, nor a mix move the whole group made", () => {
    expect(b.findings.find((f) => f.id === "F-CMP-ALA-DINNER")).toBeUndefined();
    expect(b.findings.find((f) => f.id === "F-MIX-OAK")).toBeUndefined();
    expect(b.findings.find((f) => f.id === "F-MIX-BRK")).toBeUndefined();
  });
  it("refuses to size the ticket-time drift while the reservations feed is stale", () => {
    const t = byId(b.findings, "F-TKT-ALA-DINNER");
    expect(t.state).toBe("data_insufficient");
    expect(t.blockedBy?.feed).toBe("reservations");
  });
  it("keeps human decisions across re-detection", () => {
    expect(byId(b.findings, "F-PPV-SK03").state).toBe("rejected");
    expect(byId(b.findings, "F-PPV-SK03").rejection?.code).toBe("seasonal_not_negotiable");
    expect(byId(b.findings, "F-PPV-SK01").state).toBe("investigating");
  });
  it("opens the decision window when the finding could qualify, not when the chart first twitched", () => {
    for (const f of b.findings.filter((f) => !f.historical && f.onset)) expect(f.decisionOpenedOn >= f.detectedOn).toBe(true);
    expect(b.findings.filter((f) => f.state === "expired")).toHaveLength(0);
  });
});

describe("every outcome is computed, never declared", () => {
  const outcome = Object.fromEntries(b.interventions.map((iv) => [iv.id, iv.result.outcome]));
  it("distributes the ten interventions across the verification outcomes the history was built to show", () => {
    expect(outcome).toEqual({
      "IV-01": "verified",
      "IV-02": "verified",
      "IV-03": "verified",
      "IV-04": "guardrail_failure",
      "IV-05": "inconclusive",
      "IV-06": "inconclusive",
      "IV-07": "pending",
      "IV-08": "no_effect",
      "IV-09": "verified_limited",
      "IV-10": "reversed",
    });
    expect(byId(b.interventions, "IV-07").state).toBe("measuring");
    expect(byId(b.interventions, "IV-03").state).toBe("decayed");
    expect(byId(b.interventions, "IV-04").state).toBe("guardrail_failed");
    expect(byId(b.interventions, "IV-10").state).toBe("reversed");
  });
  it("never books the estimate: the bookable figure is below the point and at or below the lower bound", () => {
    for (const iv of b.interventions.filter((iv) => iv.result.money)) {
      const e = iv.estimate as NonNullable<typeof iv.estimate>;
      expect(iv.result.money?.klass).toBe("bookable");
      expect(iv.result.money?.cents as number).toBeLessThan(Math.round(e.point));
      expect(iv.result.money?.cents as number).toBeLessThanOrEqual(Math.round(e.lower));
      expect(Number.isInteger(iv.result.money?.cents)).toBe(true);
    }
  });
  it("recomputes projected value from the recorded exposure through the lever's recovery factor", () => {
    for (const h of HISTORICAL_FINDINGS) {
      const iv = b.interventions.find((x) => x.findingId === h.id);
      expect(iv?.projectedCents).toBe(recoverableOf({ exposureCents: h.exposureCents, lever: h.lever }));
    }
    expect(byId(b.interventions, "IV-07").projectedCents).toBe(byId(b.findings, "F-LAB-OAK-DINNER-TUE").recoverableCents);
  });
  it("a guardrail breach mints nothing and a reversal keeps the original record beside the adjustment", () => {
    expect(byId(b.interventions, "IV-04").result.money).toBeNull();
    const r = byId(b.interventions, "IV-10");
    expect(r.result.money).toBeNull();
    expect(r.reversedClaimCents).toBeGreaterThan(0);
    expect(r.adjustmentCents).toBeLessThan(0);
    expect(r.history.some((h) => h.state === "verified")).toBe(true);
  });
  it("derives the adjustments register from the interventions", () => {
    expect(b.adjustments.map((a) => a.id)).toEqual(["ADJ-001", "ADJ-002", "ADJ-003"]);
    const kinds = Object.fromEntries(b.adjustments.map((a) => [a.kind, a]));
    expect(kinds.Reversal?.interventionId).toBe("IV-10");
    expect(kinds.Reversal?.status).toBe("credited");
    expect(kinds.Reversal?.cents).toBe(byId(b.interventions, "IV-10").adjustmentCents);
    expect(kinds.Decay?.interventionId).toBe("IV-03");
    expect(kinds.Dispute?.status).toBe("open");
    for (const a of b.adjustments) expect(a.cents).toBeLessThan(0);
  });
  it("reconciles the last closed month for every claim that accrued in it", () => {
    for (const id of Object.keys(b.ledgerSides)) expect(byId(b.interventions, id).result.money).not.toBeNull();
    expect(b.ledgerSides["IV-10"]).toBeUndefined();
    expect(b.closedPeriod.label).toBe("August 2026");
  });
});

describe("the ledger reads the same build", () => {
  const input = { findings: b.findings, interventions: b.interventions, actions: b.actions, adjustments: b.adjustments, feeds: b.feeds, locations: b.register.locations, scope: "all", feeMonthlyCents: b.org.feeMonthlyCents, asOf: b.asOf, period: b.period, ledgerSides: b.ledgerSides };
  const K = Object.fromEntries(kpis(input).map((k) => [k.id, k]));
  it("shows a hero the account can check, with the multiple above the pilot threshold", () => {
    expect((K.persistent?.value as Money).klass).toBe("bookable");
    expect((K.persistent?.value as Money).cents).toBeGreaterThan(0);
    expect(K.multiple?.value as number).toBeGreaterThan(3);
    expect(K.multiple?.value as number).toBeLessThan(6);
  });
  it("never adds classes: exposure counts only open findings and excludes terminal ones", () => {
    const open = b.findings.filter((f) => ["detected", "investigating", "qualified", "awaiting_decision", "accepted"].includes(f.state));
    expect((K.exposure?.value as Money).cents).toBe(open.reduce((a, f) => a + f.exposureCents, 0));
    expect(() => (K.exposure?.value as Money).plus(K.persistent?.value as Money)).toThrow();
  });
  it("scopes by location without leaking", () => {
    const perLoc = LOCATIONS.map((l) => kpis({ ...input, scope: l.id }).find((k) => k.id === "persistent")?.value as Money);
    const total = perLoc.reduce((a, m) => a + m.cents, 0);
    expect(total).toBe((K.persistent?.value as Money).cents);
  });
});

describe("copy discipline", () => {
  it("uses no banned word anywhere in the generated or declared copy", () => {
    const texts = [...b.findings.flatMap((f) => [f.title, f.plain, f.remedy.change]), ...b.interventions.flatMap((iv) => [iv.title, iv.hypothesis, iv.change, iv.result.why, iv.result.limitation ?? ""])];
    for (const t of texts) for (const w of BANNED_WORDS) expect(t.toLowerCase(), t).not.toMatch(new RegExp(`\\b${w}\\b`));
  });
  it("labels the data as synthetic", () => {
    expect(FIXTURE.label.toLowerCase()).toContain("synthetic");
    expect(INTERVENTIONS.length).toBe(10);
  });
});

describe("the second tenant", () => {
  it("is honestly empty and shares no identifier with Rosewood", () => {
    const h = buildHarbor();
    expect(h.locations).toHaveLength(1);
    expect(HARBOR_ORG_ID).not.toBe(ROSEWOOD_ORG_ID);
    expect(h.baseline.deliveredDays).toBeLessThan(h.baseline.requiredDays);
    expect(h.feeds.filter((f) => f.newest).length).toBeGreaterThan(0);
    expect(h.feeds.filter((f) => !f.newest).length).toBeGreaterThan(0);
  });
  it("has one persona per role with unique emails and real location scopes", () => {
    expect(new Set(PERSONAS.map((p) => p.email)).size).toBe(PERSONAS.length);
    for (const p of PERSONAS.filter((p) => p.org === "rosewood")) for (const l of p.locations) expect(LOCATIONS.some((x) => x.id === l)).toBe(true);
    expect(PERSONAS.some((p) => p.org === "harbor")).toBe(true);
    expect(PERSONAS.some((p) => p.role === "admin")).toBe(true);
  });
});
