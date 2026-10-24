import { describe, expect, it } from "vitest";
import type { Transaction } from "../types";
import { averageAnnualExpenses, computeFire, fireNumber, monthsToTarget, sensitivity } from "./fire";
import { projectPac } from "./projection";

const base = { portfolio: 50_000, monthlyContribution: 1_000, annualExpenses: 24_000, withdrawalRate: 0.04, realReturn: 0.04 };

describe("FIRE number", () => {
  it("expenses / withdrawal rate (25x at 4%)", () => expect(fireNumber(24_000, 0.04)).toBeCloseTo(600_000));
  it("a lower withdrawal rate needs more capital", () => expect(fireNumber(24_000, 0.03)).toBeGreaterThan(fireNumber(24_000, 0.04)));
});

describe("monthsToTarget", () => {
  it("0 when already there", () => expect(monthsToTarget(100, 0, 0.05, 100)).toBe(0));
  it("zero return: linear saving", () => expect(monthsToTarget(0, 100, 0, 1000)).toBe(10));
  it("agrees with the PAC projection formula", () => {
    const m = monthsToTarget(50_000, 1_000, 0.04, 600_000)!;
    const pts = projectPac(50_000, 1_000, 0.04, Math.ceil(m / 12) + 1);
    // value after m months >= target, after m-1 months < target (checked through the yearly series at the bracketing years)
    expect(pts[Math.floor(m / 12)].value).toBeLessThanOrEqual(600_000 + 1_000 * 12);
    expect(pts[Math.ceil(m / 12)].value).toBeGreaterThanOrEqual(600_000);
  });
  it("null when out of reach in 100 years", () => expect(monthsToTarget(0, 1, 0, 1e9)).toBeNull());
  it("more contribution is never slower", () => expect(monthsToTarget(0, 2_000, 0.04, 500_000)!).toBeLessThan(monthsToTarget(0, 1_000, 0.04, 500_000)!));
});

describe("computeFire", () => {
  it("progress, target, months and a series that ends above the target", () => {
    const r = computeFire(base);
    expect(r.valid).toBe(true);
    expect(r.target).toBeCloseTo(600_000);
    expect(r.progress).toBeCloseTo(50_000 / 600_000);
    expect(r.reached).toBe(false);
    expect(r.monthsToFi).toBeGreaterThan(0);
    expect(r.series[0]).toEqual({ year: 0, value: 50_000 });
    expect(r.series.at(-1)!.value).toBeGreaterThanOrEqual(600_000);
  });
  it("already financially independent", () => {
    const r = computeFire({ ...base, portfolio: 700_000 });
    expect(r.reached).toBe(true);
    expect(r.monthsToFi).toBe(0);
  });
  it("invalid inputs are flagged, not computed", () => {
    expect(computeFire({ ...base, withdrawalRate: 0 }).valid).toBe(false);
    expect(computeFire({ ...base, annualExpenses: -1 }).valid).toBe(false);
  });
  it("Coast FIRE: capital that grows to the target by the retirement age without more saving", () => {
    const r = computeFire({ ...base, currentAge: 30, retireAge: 60 });
    expect(r.coastNumber).toBeCloseTo(600_000 / Math.pow(1.04, 30), 4);
    expect(r.coastReached).toBe(r.coastNumber !== null && 50_000 >= r.coastNumber);
    expect(computeFire(base).coastNumber).toBeNull();
    expect(computeFire({ ...base, currentAge: 60, retireAge: 50 }).coastNumber).toBeNull();
  });
});

describe("sensitivity", () => {
  it("higher return and higher withdrawal rate both shorten the road", () => {
    const g = sensitivity(base, [0.03, 0.05], [0.03, 0.04]);
    expect(g[1][0]!).toBeLessThan(g[0][0]!);
    expect(g[0][1]!).toBeLessThan(g[0][0]!);
  });
});

describe("averageAnnualExpenses", () => {
  const e = (date: string, amount: number): Transaction => ({ id: date + amount, date, type: "expense", amount });
  it("annualises over the months actually covered", () => {
    // 3 months covered (Aug, Sep, Oct), 300 total -> 100/month -> 1200/year
    expect(averageAnnualExpenses([e("2026-08-10", 100), e("2026-09-10", 100), e("2026-10-10", 100)], "2026-10-24")).toBeCloseTo(1200);
  });
  it("ignores income, older than 12 months, and returns null with no expenses", () => {
    expect(averageAnnualExpenses([{ id: "i", date: "2026-10-01", type: "income", amount: 5000 }, e("2025-01-01", 999)], "2026-10-24")).toBeNull();
  });
  it("a full year", () => {
    const year = [e("2025-11-05", 1200), e("2026-10-05", 1200)];
    expect(averageAnnualExpenses(year, "2026-10-24")).toBeCloseTo((2400 / 12) * 12);
  });
});
