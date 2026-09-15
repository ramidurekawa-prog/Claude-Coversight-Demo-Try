import { describe, expect, it } from "vitest";
import { assertCents } from "../src/money.js";

describe("assertCents", () => {
  it("accepts integers", () => expect(assertCents(1234)).toBe(1234));
  it("rejects fractional cents", () => expect(() => assertCents(12.5)).toThrow(/integer cents/));
});
