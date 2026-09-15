import { describe, expect, it } from "vitest";
import { resolveOverlaps, type OverlapClaim } from "../src/overlap";

const claim = (o: Partial<OverlapClaim> & { id: string }): OverlapClaim => ({ locs: ["oak"], account: "5010", period: "2026-W37", amountCents: 100000, ...o });

describe("overlap engine (System 5)", () => {
  it("the narrower scope holds the intersection; the wider one is reduced", () => {
    const ppv = claim({ id: "ppv", locs: ["oak", "brk", "ala"], amountCents: 190000, intersectionWith: { menu: 62000 } });
    const menu = claim({ id: "menu", locs: ["oak", "brk", "ala"], items: ["m01", "m02"], amountCents: 140000 });
    const [a, b] = resolveOverlaps([ppv, menu]);
    expect(a?.overlapStatus).toBe("reduced");
    expect(a?.overlapDeductionCents).toBe(62000);
    expect(b?.overlapStatus).toBe("holds");
    expect(b?.overlapDeductionCents).toBe(0);
    const total = (a!.amountCents - a!.overlapDeductionCents) + (b!.amountCents - b!.overlapDeductionCents);
    expect(total).toBe(190000 + 140000 - 62000);
  });
  it("a human allocation wins over every other rule", () => {
    const [a, b] = resolveOverlaps([claim({ id: "a", amountCents: 500, intersectionWith: { b: 100 }, items: ["x"] }), claim({ id: "b", amountCents: 500, humanAllocation: true })]);
    expect(a?.overlapStatus).toBe("reduced");
    expect(b?.overlapStatus).toBe("holds");
  });
  it("the earliest verified claim holds", () => {
    const [a, b] = resolveOverlaps([claim({ id: "a", verifiedAt: "2026-06-01", intersectionWith: { b: 100 } }), claim({ id: "b", verifiedAt: "2026-05-01", items: ["x"] })]);
    expect(b?.overlapStatus).toBe("holds");
    expect(a?.overlapDeductionCents).toBe(100);
  });
  it("ties split proportionally and both are flagged", () => {
    const [a, b] = resolveOverlaps([claim({ id: "a", amountCents: 300, intersectionWith: { b: 90 } }), claim({ id: "b", amountCents: 600 })]);
    expect(a?.overlapStatus).toBe("reduced");
    expect(b?.overlapStatus).toBe("reduced");
    expect((a?.overlapDeductionCents ?? 0) + (b?.overlapDeductionCents ?? 0)).toBe(90);
  });
  it("does not touch claims on different accounts, periods or locations", () => {
    const out = resolveOverlaps([claim({ id: "a", account: "5010", intersectionWith: { b: 100 } }), claim({ id: "b", account: "6020" })]);
    expect(out.every((c) => c.overlapStatus === "none")).toBe(true);
  });
});
