import { describe, expect, it } from "vitest";
import { addDays } from "../src/dates.js";
import { decayAt, persistence } from "../src/persistence.js";

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
