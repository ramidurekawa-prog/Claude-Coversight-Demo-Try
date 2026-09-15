import { describe, expect, it } from "vitest";
import type { GuardrailResult } from "../src/guardrails.js";
import type { EstimateOk } from "../src/measure.js";
import { __mintWithWrongToken, runGates, verificationService, type VerificationInput } from "../src/verify.js";

const est = (over: Partial<EstimateOk> = {}): EstimateOk => ({
  ok: true,
  method: "did",
  point: 40000,
  se: 8000,
  df: 20,
  tcrit: 1.72,
  tcrit2: 2.09,
  ci: [23280, 56720],
  lower: 40000 - 1.72 * 8000,
  upper: 40000 + 1.72 * 8000,
  means: { Tpre: 1, Tpost: 1, Cpre: 1, Cpost: 1 },
  n: { Tpre: 8, Tpost: 4, Cpre: 8, Cpost: 4 },
  dT: 0,
  dC: 0,
  placebo: { ok: true, pass: true, point: 0, se: 1, t: 0, crit: 2 },
  preFit: 0.8,
  alpha: 0.05,
  mde: 15000,
  sePlanned: 5000,
  window: { execDate: "2026-07-20", preLo: "2026-05-25", postHi: "2026-08-17" },
  ...over,
});
const gr = (passed: boolean, id = "rating"): GuardrailResult => ({ id, label: "Guest rating", observed: -0.02, passed, observedLabel: "moved −0.02", thresholdLabel: "−0.15" });
const base = (over: Partial<VerificationInput> = {}): VerificationInput => ({ estimate: est(), executionFidelity: "complete", plan: { minObservations: 4, preferredObservations: 4, rung: 2 }, incrementalCostCents: 0, overlapStatus: "none", overlapDeductionCents: 0, ...over });
const ctx = (guards: GuardrailResult[] = [gr(true)], dq = true) => ({ guardrailResults: guards, dataQuality: { pass: dq, detail: dq ? "ok" : "Toast orders fell below 90% completeness." } });

describe("the mint and the verification decision service", () => {
  it("cannot be reached with a forged token", () => {
    expect(() => __mintWithWrongToken()).toThrow(/MINT VIOLATION/);
  });
  it("books the lower bound, never the point estimate — and never the detector's estimate", () => {
    const r = verificationService(base(), ctx());
    expect(r.outcome).toBe("verified");
    expect(r.money?.klass).toBe("bookable");
    expect(r.money?.cents).toBe(Math.round(40000 - 1.72 * 8000));
    expect(r.money!.cents).toBeLessThan(40000);
  });
  it("nets incremental cost across 52 weeks and unresolved overlap", () => {
    const r = verificationService(base({ incrementalCostCents: 52000, overlapDeductionCents: 1000 }), ctx());
    expect(r.money?.cents).toBe(Math.round(40000 - 1.72 * 8000) - 1000 - 1000);
  });
  it("a failed gate cannot mint: unconfirmed execution is inconclusive", () => {
    expect(verificationService(base({ executionFidelity: "not_started" }), ctx()).outcome).toBe("inconclusive");
    expect(verificationService(base({ executionFidelity: "unknown" }), ctx()).money).toBeNull();
  });
  it("a guardrail breach is guardrail_failure with no partial credit", () => {
    const r = verificationService(base(), ctx([gr(false)]));
    expect(r.outcome).toBe("guardrail_failure");
    expect(r.money).toBeNull();
    expect(r.breaches?.length).toBe(1);
  });
  it("a missing guardrail observation is a failure, not a pass", () => {
    const missing: GuardrailResult = { id: "x", label: "X", observed: null, passed: false, observedLabel: "—", thresholdLabel: "—" };
    expect(verificationService(base(), ctx([missing])).outcome).toBe("guardrail_failure");
  });
  it("a failed placebo is inconclusive, never a smaller number", () => {
    const r = verificationService(base({ estimate: est({ placebo: { ok: true, pass: false, point: 9000, se: 2000, t: 4.5, crit: 2 } }) }), ctx());
    expect(r.outcome).toBe("inconclusive");
    expect(r.money).toBeNull();
  });
  it("distinguishes no effect from cannot tell", () => {
    expect(verificationService(base({ estimate: est({ point: 5000, preFit: 0.9 }) }), ctx()).outcome).toBe("no_effect");
    expect(verificationService(base({ estimate: est({ point: 5000, preFit: 0.2 }) }), ctx()).outcome).toBe("inconclusive");
  });
  it("negative effects recommend a reversal; directional effects earn no claim", () => {
    expect(verificationService(base({ estimate: est({ point: -30000 }) }), ctx()).outcome).toBe("negative");
    expect(verificationService(base({ estimate: est({ point: 16000, se: 12000 }) }), ctx()).outcome).toBe("directional");
  });
  it("data failure quarantines the claim", () => {
    expect(verificationService(base(), ctx([gr(true)], false)).outcome).toBe("data_failure");
  });
  it("a weak control downgrades to verified with limitations", () => {
    const r = verificationService(base({ estimate: est({ preFit: 0.5 }) }), ctx());
    expect(r.outcome).toBe("verified_limited");
    expect(r.limitation).toMatch(/comparability|correlation/i);
    expect(r.money).not.toBeNull();
  });
  it("unresolved overlap blocks via the gates", () => {
    const r = verificationService(base({ overlapStatus: "unresolved" }), ctx());
    expect(r.outcome).toBe("inconclusive");
    expect(r.gateRun?.failed.map((g) => g.id)).toContain("OVL");
  });
  it("is idempotent — re-running never inflates", () => {
    const a = verificationService(base(), ctx());
    const b = verificationService(base(), ctx());
    expect(a.money?.cents).toBe(b.money?.cents);
  });
  it("runGates reports every gate with its verdict", () => {
    const g = runGates({ est: est(), plan: { minObservations: 4, preferredObservations: 4, rung: 2 }, guardrailResults: [gr(true)], dataQuality: { pass: true, detail: "ok" }, executionFidelity: "complete", overlapStatus: "none" });
    expect(g.allPassed).toBe(true);
    expect(g.gates.map((x) => x.id)).toEqual(["EXEC", "OBS", "POWER", "TREND", "SIGN", "COMP", "GR:rating", "DQ", "OVL"]);
  });
});
