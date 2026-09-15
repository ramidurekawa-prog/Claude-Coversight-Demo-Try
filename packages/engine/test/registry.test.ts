import { describe, expect, it } from "vitest";
import { assertMetricContract, CONF_DIMS, EQ, equation, RUNGS, UNITS, VERIFICATION_OUTCOMES } from "../src/registry";

describe("registries", () => {
  it("every equation carries a valid unit and a family", () => {
    for (const e of Object.values(EQ)) {
      expect(UNITS).toContain(e.unit);
      expect(e.family.length).toBeGreaterThan(0);
    }
    expect(equation("G8").note).toMatch(/MINT/);
    expect(() => equation("Z9")).toThrow(/not registered/);
  });
  it("a metric missing any of the ten attributes refuses to render", () => {
    expect(() => assertMetricContract("x", { definition: "d" })).toThrow(/METRIC CONTRACT/);
  });
  it("has eight confidence dimensions, seven rungs and ten outcomes plus pending", () => {
    expect(CONF_DIMS).toHaveLength(8);
    expect(RUNGS).toHaveLength(7);
    expect(Object.keys(VERIFICATION_OUTCOMES)).toHaveLength(11);
  });
});
