import { describe, expect, it } from "vitest";
import { businessDaysBetween, isStale } from "./staleness";

describe("staleness", () => {
  it("counts only working days", () => {
    expect(businessDaysBetween("2026-10-23", "2026-10-26")).toBe(1); // Fri -> Mon
    expect(businessDaysBetween("2026-10-19", "2026-10-23")).toBe(4);
    expect(businessDaysBetween("2026-10-24", "2026-10-24")).toBe(0);
  });
  it("warns past 3 working days", () => {
    expect(isStale("2026-10-22", "2026-10-26")).toBe(false); // Thu -> Mon = 2
    expect(isStale("2026-10-19", "2026-10-23")).toBe(true); // Mon -> Fri = 4
  });
});
