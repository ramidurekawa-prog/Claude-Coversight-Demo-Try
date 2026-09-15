import { describe, expect, it } from "vitest";
import { addDays, dayOfWeek, daysBetween, daysInMonth, formatDate, fromDayNumber, toDayNumber, weekOf } from "../src/dates.js";

describe("dates (no Date objects)", () => {
  it("round-trips civil dates", () => {
    for (const d of ["1970-01-01", "2000-02-29", "2026-09-15", "2026-12-31", "2027-01-01"]) expect(fromDayNumber(toDayNumber(d))).toBe(d);
    expect(toDayNumber("1970-01-01")).toBe(0);
  });
  it("knows the weekday", () => {
    expect(dayOfWeek("2026-09-15")).toBe(2); // Tuesday
    expect(dayOfWeek("1970-01-01")).toBe(4); // Thursday
    expect(dayOfWeek("2026-09-13")).toBe(0); // Sunday
  });
  it("adds and diffs", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(daysBetween("2026-09-08", "2026-10-06")).toBe(28);
  });
  it("finds the Monday of the week", () => {
    expect(weekOf("2026-09-15")).toBe("2026-09-14");
    expect(weekOf("2026-09-14")).toBe("2026-09-14");
    expect(weekOf("2026-09-13")).toBe("2026-09-07");
  });
  it("formats and counts months", () => {
    expect(formatDate("2026-09-08")).toBe("8 Sep");
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2024-02")).toBe(29);
  });
});
