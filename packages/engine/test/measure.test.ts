import { describe, expect, it } from "vitest";
import { addDays } from "../src/dates.js";
import { did, reconcileA, toWeekly } from "../src/measure.js";

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const EXEC = "2026-07-06";
function pair(effect: number, opts: { trendT?: number; trendC?: number; noise?: number; seed?: number } = {}) {
  const r = lcg(opts.seed ?? 11);
  const t = [];
  const c = [];
  for (let i = -70; i < 35; i++) {
    const date = addDays(EXEC, i);
    const common = 1000 + 80 * Math.sin(i / 5) + (r() - 0.5) * (opts.noise ?? 40);
    const trendT = (opts.trendT ?? 0) * i;
    const trendC = (opts.trendC ?? 0) * i;
    t.push({ date, y: common + trendT + (i >= 0 ? effect : 0) + (r() - 0.5) * 30 });
    c.push({ date, y: common + trendC + (r() - 0.5) * 30 });
  }
  return { t, c };
}

describe("difference-in-differences", () => {
  it("recovers an injected effect with an interval that covers it", () => {
    const { t, c } = pair(-120);
    const e = did({ treatment: t, control: c, execDate: EXEC });
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    expect(Math.abs(e.point - -120)).toBeLessThan(30);
    expect(e.ci[0]).toBeLessThan(-120);
    expect(e.ci[1]).toBeGreaterThan(-120);
    expect(e.se).toBeGreaterThan(0);
    expect(e.mde).toBeGreaterThan(0);
    expect(e.placebo.ok).toBe(true);
    expect(e.placebo.pass).toBe(true);
    expect(e.preFit).toBeGreaterThan(0.8);
    expect(e.lower).toBeLessThan(e.point); // raw bound; the evaluator orients the sign so positive = saving
    expect(e.upper).toBeGreaterThan(e.point);
  });
  it("finds nothing where nothing was injected", () => {
    const { t, c } = pair(0, { seed: 5 });
    const e = did({ treatment: t, control: c, execDate: EXEC });
    expect(e.ok && Math.abs(e.point) < e.mde).toBe(true);
  });
  it("fails the placebo when the pre-trends are not parallel", () => {
    const { t, c } = pair(-120, { trendT: 4, seed: 9 });
    const e = did({ treatment: t, control: c, execDate: EXEC });
    expect(e.ok && e.placebo.pass).toBe(false);
  });
  it("refuses with too few observations", () => {
    const e = did({ treatment: [{ date: EXEC, y: 1 }], control: [], execDate: EXEC });
    expect(e.ok).toBe(false);
  });
  it("aggregates to Monday weeks", () => {
    const w = toWeekly([{ date: "2026-09-14", y: 2 }, { date: "2026-09-15", y: 4 }, { date: "2026-09-21", y: 10 }]);
    expect(w).toEqual([{ date: "2026-09-14", y: 3 }, { date: "2026-09-21", y: 10 }]);
  });
});

describe("reconciliation (Family A)", () => {
  it("measures a fall in observed unit price as a saving and discloses the index", () => {
    const obs = [];
    const idx = [];
    for (let i = -8; i < 5; i++) {
      const date = addDays(EXEC, i * 7);
      obs.push({ date, y: i >= 0 ? 537 : 589 + (i % 2) });
      idx.push({ date, y: 400 + (i % 3) });
    }
    const e = reconcileA({ observed: obs, index: idx, execDate: EXEC });
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    expect(e.point).toBeCloseTo(51.5, 0);
    expect(e.lower).toBeGreaterThan(40);
    expect(Math.abs(e.indexShare ?? 1)).toBeLessThan(0.5);
  });
});
