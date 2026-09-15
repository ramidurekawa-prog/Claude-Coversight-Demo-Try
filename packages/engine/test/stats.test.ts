import { describe, expect, it } from "vitest";
import { apportion, mean, median, pearson, quantile, sd, slope, tq, variance, zq } from "../src/stats.js";

describe("stats", () => {
  it("basic moments", () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(variance([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(4.571, 3);
    expect(sd([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
    expect(median([3, 1, 2])).toBe(2);
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
  });
  it("normal and t quantiles", () => {
    expect(zq(0.975)).toBeCloseTo(1.95996, 4);
    expect(zq(0.8)).toBeCloseTo(0.84162, 4);
    expect(tq(0.95, 10)).toBeCloseTo(1.812, 2);
    expect(tq(0.975, 30)).toBeCloseTo(2.042, 2);
  });
  it("slope and correlation", () => {
    expect(slope([1, 2, 3, 4])).toBeCloseTo(1, 9);
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 9);
  });
  it("largest-remainder apportionment sums exactly", () => {
    const parts = apportion(100, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
    expect(parts).toEqual([34, 33, 33]);
    expect(apportion(7, [0, 0]).reduce((a, b) => a + b, 0)).toBe(7);
  });
});
