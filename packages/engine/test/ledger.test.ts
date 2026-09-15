import { describe, expect, it } from "vitest";
import { centsInScope, shareOf } from "../src/ledger";

const ALL = ["oak", "brk", "ala"];

describe("scoping never counts a dollar in more than one room", () => {
  it("apportions a group-level claim equally and exactly", () => {
    const claim = { loc: "group", locs: ALL };
    const parts = ALL.map((l) => centsInScope(claim, 100, [l], ALL));
    expect(parts).toEqual([34, 33, 33]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
    expect(centsInScope(claim, 100, ALL, ALL)).toBe(100);
  });
  it("keeps a single-room claim whole in its own room and absent elsewhere", () => {
    const claim = { loc: "brk", locs: ["brk"] };
    expect(centsInScope(claim, 777, ["brk"], ALL)).toBe(777);
    expect(centsInScope(claim, 777, ["oak"], ALL)).toBe(0);
    expect(shareOf(claim, ["oak", "ala"], ALL)).toBe(0);
  });
  it("carries the sign of an adjustment through apportionment", () => {
    const adj = { loc: "group" };
    const parts = ALL.map((l) => centsInScope(adj, -10, [l], ALL));
    expect(parts.reduce((a, b) => a + b, 0)).toBe(-10);
    expect(parts.every((p) => p <= 0)).toBe(true);
  });
});
