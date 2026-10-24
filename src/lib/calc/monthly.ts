import type { Transaction } from "../types";

export interface MonthStats {
  month: string; // "YYYY-MM"
  income: number;
  expense: number;
  invested: number; // PAC + lump sum, never counted as expense
  savingsRate: number | null; // null = "n.d." (no income that month)
}

export function monthlyStats(txs: Transaction[]): MonthStats[] {
  const byMonth = new Map<string, MonthStats>();
  for (const t of txs) {
    const month = t.date.slice(0, 7);
    const m = byMonth.get(month) ?? { month, income: 0, expense: 0, invested: 0, savingsRate: null };
    if (t.type === "income") m.income += t.amount;
    else if (t.type === "expense") m.expense += t.amount;
    else m.invested += t.amount;
    byMonth.set(month, m);
  }
  return [...byMonth.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((m) => ({ ...m, savingsRate: m.income > 0 ? ((m.income - m.expense) / m.income) * 100 : null }));
}

/** Expense totals per category, biggest first. `month` = "YYYY-MM" or omitted for the whole period. */
export function expensesByCategory(txs: Transaction[], month?: string): { category: string; total: number }[] {
  const totals = new Map<string, number>();
  for (const t of txs) {
    if (t.type !== "expense" || (month && t.date.slice(0, 7) !== month)) continue;
    const key = t.category || "other";
    totals.set(key, (totals.get(key) ?? 0) + t.amount);
  }
  return [...totals].map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total);
}
