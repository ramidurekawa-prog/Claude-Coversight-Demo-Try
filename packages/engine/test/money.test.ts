import { describe, expect, it } from "vitest";
import { assertCents, BANNED_WORDS, formatUsd, Money, RESERVED_WORDS, sumMoney } from "../src/money.js";

describe("Money", () => {
  it("is integer cents, always", () => {
    expect(assertCents(1234)).toBe(1234);
    expect(() => assertCents(12.5)).toThrow(/integer cents/);
    expect(() => new Money(1.5, "verified")).toThrow(/integer cents/);
  });
  it("refuses to add two claim classes", () => {
    const a = new Money(100, "recoverable");
    const b = new Money(100, "verified");
    expect(() => a.plus(b)).toThrow(/CLAIM-CLASS VIOLATION/);
    expect(() => sumMoney([a, b])).toThrow(/CLAIM-CLASS VIOLATION/);
    expect(sumMoney([a, new Money(50, "recoverable")]).cents).toBe(150);
  });
  it("formats dollars without locale dependence", () => {
    expect(formatUsd(123456)).toBe("$1,235");
    expect(formatUsd(1234)).toBe("$12.34");
    expect(formatUsd(-9900)).toBe("−$99.00");
    expect(formatUsd(50000, { sign: true })).toBe("+$500");
  });
  it("keeps the reserved and banned vocabularies", () => {
    expect(RESERVED_WORDS).toContain("banked");
    expect(BANNED_WORDS).toEqual(["guaranteed", "certain", "proven"]);
  });
});
