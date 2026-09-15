import { describe, expect, it } from "vitest";
import { cusumChart, driftOnset, ewmaChart } from "../src/charts.js";
import { addDays } from "../src/dates.js";

// Deterministic noise for tests only (the engine itself has no randomness).
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function series(n: number, step: { at: number; size: number }, seed = 7) {
  const r = lcg(seed);
  const out = [];
  for (let i = 0; i < n; i++) out.push({ date: addDays("2026-01-05", i), v: 10 + (r() - 0.5) * 2 + (i >= step.at ? step.size : 0) });
  return out;
}

describe("control charts", () => {
  it("EWMA signals a sustained shift and stays quiet on noise", () => {
    const quiet = ewmaChart(series(120, { at: 999, size: 0 }));
    expect(quiet.points.filter((p) => p.signal).length).toBeLessThanOrEqual(2);
    const shifted = ewmaChart(series(120, { at: 60, size: 3 }));
    expect(shifted.points.slice(70).every((p) => p.signal === "high")).toBe(true);
    expect(shifted.alpha).toBeCloseTo(0.002, 3);
  });
  it("CUSUM names the day the drift started, not the day it crossed", () => {
    const cus = cusumChart(series(120, { at: 60, size: 2 }));
    const onset = driftOnset(cus);
    expect(onset).not.toBeNull();
    expect(onset?.direction).toBe("high");
    const onsetIdx = onset?.onsetIndex ?? 0;
    expect(onsetIdx).toBeGreaterThanOrEqual(55);
    expect(onsetIdx).toBeLessThanOrEqual(63);
    expect(onset!.signalIndex).toBeGreaterThan(onsetIdx);
  });
  it("returns no onset when nothing moved", () => {
    expect(driftOnset(cusumChart(series(100, { at: 999, size: 0 }, 3)))).toBeNull();
  });
});
