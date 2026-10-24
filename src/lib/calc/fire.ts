// FIRE (financial independence) maths. Pure. Everything is in today's euros: use a REAL (after-inflation) return.
// Hypotheses, not predictions or advice: the "4% rule" is a historical rule of thumb with no guarantee.
import type { Transaction } from "../types";

export interface FireInput {
  portfolio: number; // investable capital today
  monthlyContribution: number;
  annualExpenses: number; // yearly spending to cover in retirement
  withdrawalRate: number; // e.g. 0.04
  realReturn: number; // e.g. 0.04, after inflation
  currentAge?: number | null;
  retireAge?: number | null; // age at which you want to stop working (for Coast FIRE)
}

export interface FirePoint { year: number; value: number }

export interface FireResult {
  valid: boolean; // false when withdrawalRate <= 0 or negative inputs
  target: number; // FIRE number = expenses / withdrawalRate
  progress: number; // portfolio / target (1 = reached)
  reached: boolean;
  monthsToFi: number | null; // null = not reached within 100 years
  series: FirePoint[]; // yearly portfolio value, up to the year FI is reached (min 5, max 60 years)
  coastNumber: number | null; // capital that, left alone, grows to the target by retireAge
  coastReached: boolean | null;
}

const MAX_MONTHS = 1200;
const monthlyRate = (annual: number) => Math.pow(1 + annual, 1 / 12) - 1;

/** FIRE number: the capital whose yearly withdrawals cover the expenses. */
export const fireNumber = (annualExpenses: number, withdrawalRate: number) => annualExpenses / withdrawalRate;

/** Months until the portfolio reaches `target`, saving `monthly` each month (end of month). null when unreachable in 100 years. */
export function monthsToTarget(portfolio: number, monthly: number, annualReturn: number, target: number): number | null {
  if (portfolio >= target) return 0;
  const i = monthlyRate(annualReturn);
  let v = portfolio;
  for (let m = 1; m <= MAX_MONTHS; m++) {
    v = v * (1 + i) + monthly;
    if (v >= target) return m;
  }
  return null;
}

export function computeFire(input: FireInput): FireResult {
  const { portfolio, monthlyContribution: A, annualExpenses, withdrawalRate, realReturn } = input;
  const valid = withdrawalRate > 0 && annualExpenses >= 0 && portfolio >= 0 && A >= 0 && realReturn > -1;
  if (!valid) return { valid: false, target: 0, progress: 0, reached: false, monthsToFi: null, series: [], coastNumber: null, coastReached: null };

  const target = fireNumber(annualExpenses, withdrawalRate);
  const months = monthsToTarget(portfolio, A, realReturn, target);
  const years = Math.min(60, Math.max(5, months === null ? 60 : Math.ceil(months / 12) + 2));
  const i = monthlyRate(realReturn);
  const series: FirePoint[] = [];
  let v = portfolio;
  for (let m = 0; m <= years * 12; m++) {
    if (m % 12 === 0) series.push({ year: m / 12, value: v });
    v = v * (1 + i) + A;
  }

  const span = input.currentAge != null && input.retireAge != null ? input.retireAge - input.currentAge : null;
  const coastNumber = span !== null && span > 0 ? target / Math.pow(1 + realReturn, span) : null;
  return {
    valid, target, progress: target > 0 ? portfolio / target : 1, reached: portfolio >= target, monthsToFi: months, series,
    coastNumber, coastReached: coastNumber === null ? null : portfolio >= coastNumber,
  };
}

/** Years to FI for a grid of returns x withdrawal rates (each cell null = more than 100 years). */
export function sensitivity(base: FireInput, returns: number[], rates: number[]): (number | null)[][] {
  return returns.map((r) => rates.map((w) => {
    const m = monthsToTarget(base.portfolio, base.monthlyContribution, r, fireNumber(base.annualExpenses, w));
    return m === null ? null : m / 12;
  }));
}

/**
 * Yearly spending estimated from the transactions: expenses of the last 12 months, annualised over the months actually covered
 * (from the first month with an expense in the window up to the current one). null when there are no expenses.
 */
export function averageAnnualExpenses(txs: Transaction[], today: string): number | null {
  const [y, m] = today.split("-").map(Number);
  const idx = (iso: string) => +iso.slice(0, 4) * 12 + +iso.slice(5, 7);
  const now = y * 12 + m;
  const inWindow = txs.filter((t) => t.type === "expense" && idx(t.date) > now - 12 && idx(t.date) <= now);
  if (!inWindow.length) return null;
  const first = Math.min(...inWindow.map((t) => idx(t.date)));
  const covered = now - first + 1;
  return (inWindow.reduce((a, t) => a + t.amount, 0) / covered) * 12;
}
