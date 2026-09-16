import { describe, expect, it } from "vitest";
import { addDays } from "../src/dates";
import { decayAt, persistence } from "../src/persistence";

const weekly = (vals: number[]) => vals.map((y, i) => ({ date: addDays("2026-07-20", 7 * (i + 1)), y }));

describe("persistence (G12)", () => {
  it("is not assessed before three post-window weeks", () => {
    expect(persistence(weekly([100, 100]), "2026-07-13").status).toBe("not_assessed");
  });
  it("classifies a flat series as structural and holding", () => {
    const p = persistence(weekly([100, 101, 99, 100, 100, 101, 99, 100]), "2026-07-13");
    expect(p.cls).toBe("structural");
    expect(p.status).toBe("holding");
    expect(p.checks).toBe(2);
  });
  it("classifies a fast decay as upkeep and decaying", () => {
    const p = persistence(weekly([100, 80, 64, 51, 41, 33, 26]), "2026-07-13");
    expect(p.cls).toBe("upkeep");
    expect(p.status).toBe("decaying");
    expect(p.halfLifeWeeks!).toBeLessThan(8);
  });
  it("decay multipliers", () => {
    expect(decayAt("structural", undefined, 10)).toBe(1);
    expect(decayAt("upkeep", 4, 4)).toBeCloseTo(0.5, 6);
  });
});

describe("confidence never calls a decaying claim persistent", () => {
  it("caps the persistence dimension while the value is leaving", async () => {
    const { confidenceWord, interventionConfidence } = await import("../src/confidence");
    const base = { dataQuality: { pass: true, detail: "ok" }, estimate: { point: 5000, mde: 2000, n: { Tpre: 8, Tpost: 4, Cpre: 8, Cpost: 4 }, placebo: { ok: true, pass: true }, preFit: 0.8 }, plan: { rung: 2, windowDays: 28, unit: "week", comparison: "peers" }, executionFidelity: "complete", evidence: [{ type: "x", detail: "y", resolved: true }], guardrailResults: [{ id: "rating", label: "Rating", observed: 0, passed: true, observedLabel: "", thresholdLabel: "" }] };
    const holding = interventionConfidence({ ...base, persistence: { status: "holding", checks: 5, elapsedWeeks: 20 } } as never, null);
    const decaying = interventionConfidence({ ...base, persistence: { status: "decaying", checks: 5, elapsedWeeks: 20 } } as never, null);
    expect(confidenceWord(holding)).toBe("Persistent");
    expect(confidenceWord(decaying)).not.toBe("Persistent");
    expect(decaying.persistence.score).toBeLessThan(0.5);
  });
});
