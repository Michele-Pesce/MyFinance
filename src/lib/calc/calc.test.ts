import { describe, expect, it } from "vitest";
import type { Asset, Transaction } from "../types";
import { collectReceivable, computeAsset, computePortfolio, estimateUnits, expensesByCategory, monthlyStats, projectPac, setManualValue } from "./index";

const asset = (o: Partial<Asset> & Pick<Asset, "id" | "class">): Asset => ({
  name: o.id, monthlyContribution: 0, initialInvested: 0, initialUnits: 0, manualValue: 0, ...o,
});
const tx = (o: Partial<Transaction> & Pick<Transaction, "id" | "type" | "amount">): Transaction => ({ date: "2026-01-15", ...o });

describe("asset value", () => {
  it("priced asset: value = units * price, invested = initial + PACs", () => {
    const a = asset({ id: "a", class: "etf", initialInvested: 100, initialUnits: 10, manualPrice: 12 });
    const r = computeAsset(a, [tx({ id: "1", type: "pac", amount: 50, assetId: "a", units: 5 })]);
    expect(r.units).toBe(15);
    expect(r.invested).toBe(150);
    expect(r.value).toBe(180);
    expect(r.gain).toBe(30);
    expect(r.gainPct).toBeCloseTo(20);
  });

  it("automatic price of the linked instrument wins over the manual one", () => {
    const a = asset({ id: "a", class: "etf", initialUnits: 2, manualPrice: 10, instrumentId: "ins" });
    expect(computeAsset(a, [], { ins: 30 }).value).toBe(60);
    expect(computeAsset(a, [], {}).value).toBe(20); // no auto price -> falls back to manual
  });

  it("unpriced asset: manual value + only PACs after manualValueAt", () => {
    const a = asset({ id: "a", class: "etf", manualValue: 1000, manualValueAt: "2026-01-10" });
    const txs = [
      tx({ id: "old", type: "pac", amount: 100, assetId: "a", date: "2026-01-10" }), // same day: already in manualValue
      tx({ id: "new", type: "pac", amount: 40, assetId: "a", date: "2026-01-11" }),
    ];
    expect(computeAsset(a, txs).value).toBe(1040);
  });

  it("manualValueAt null: every PAC counts", () => {
    const a = asset({ id: "a", class: "etf", manualValue: 10 });
    expect(computeAsset(a, [tx({ id: "1", type: "lump_sum", amount: 5, assetId: "a" })]).value).toBe(15);
  });

  it("gain is null, not 0, when invested <= 0", () => {
    const r = computeAsset(asset({ id: "a", class: "crypto", manualValue: 50 }), []);
    expect(r.gain).toBeNull();
    expect(r.gainPct).toBeNull();
  });

  it("income and expense with no account change nothing", () => {
    const a = asset({ id: "a", class: "liquidity", manualValue: 100 });
    expect(computeAsset(a, [tx({ id: "1", type: "income", amount: 500 }), tx({ id: "2", type: "expense", amount: 20 })]).value).toBe(100);
  });

  it("expenses and income booked on a liquidity account move its balance", () => {
    const a = asset({ id: "card", class: "liquidity", manualValue: 100 });
    const txs = [tx({ id: "1", type: "income", amount: 500, assetId: "card" }), tx({ id: "2", type: "expense", amount: 20, assetId: "card" })];
    const r = computeAsset(a, txs);
    expect(r.value).toBe(580);
    expect(r.invested).toBe(0); // not an investment: cost basis and gain are untouched
    expect(r.gain).toBeNull();
  });

  it("only what is dated after the manual balance counts, and each account has its own balance", () => {
    const cash = asset({ id: "cash", class: "liquidity", manualValue: 50, manualValueAt: "2026-01-10" });
    const card = asset({ id: "card", class: "liquidity", manualValue: 200 });
    const txs = [
      tx({ id: "old", type: "expense", amount: 10, assetId: "cash", date: "2026-01-10" }), // already inside the manual value
      tx({ id: "new", type: "expense", amount: 5, assetId: "cash", date: "2026-01-11" }),
      tx({ id: "other", type: "expense", amount: 30, assetId: "card", date: "2026-01-11" }),
    ];
    expect(computeAsset(cash, txs).value).toBe(45);
    expect(computeAsset(card, txs).value).toBe(170);
    expect(computePortfolio([cash, card], txs).liquidity).toBe(215);
  });
});

describe("portfolio aggregates", () => {
  const assets = [
    asset({ id: "cash", class: "liquidity", manualValue: 1000 }),
    asset({ id: "etf1", class: "etf", initialInvested: 500, initialUnits: 5, manualPrice: 120, monthlyContribution: 100 }),
    asset({ id: "etf0", class: "etf", manualValue: 300 }), // no cost basis: excluded from the ETF %
    asset({ id: "btc", class: "crypto", manualValue: 200 }),
    asset({ id: "debt", class: "receivable", manualValue: 80 }),
  ];
  const p = computePortfolio(assets, []);

  it("net worth excludes receivables, which are shown apart", () => {
    expect(p.netWorth).toBe(1000 + 600 + 300 + 200);
    expect(p.receivables).toBe(80);
  });
  it("splits liquidity / invested / crypto", () => {
    expect(p.liquidity).toBe(1000);
    expect(p.invested).toBe(900);
    expect(p.crypto).toBe(200);
  });
  it("ETF return uses only assets with a cost basis", () => {
    expect(p.etfGain).toBe(100);
    expect(p.etfGainPct).toBeCloseTo(20);
    expect(p.etfValue).toBe(900); // projection start counts every ETF
    expect(p.monthlyPac).toBe(100);
  });
  it("archived assets are ignored", () => {
    expect(computePortfolio([...assets, asset({ id: "x", class: "liquidity", manualValue: 9999, archived: true })], []).netWorth).toBe(p.netWorth);
  });
});

describe("monthly stats", () => {
  const txs = [
    tx({ id: "1", type: "income", amount: 1000, date: "2026-02-01" }),
    tx({ id: "2", type: "expense", amount: 250, date: "2026-02-10", category: "food" }),
    tx({ id: "3", type: "pac", amount: 300, date: "2026-02-12" }),
    tx({ id: "4", type: "expense", amount: 50, date: "2026-03-02", category: "food" }),
    tx({ id: "5", type: "expense", amount: 30, date: "2026-03-03", category: "fun" }),
  ];
  it("savings rate = (income - expense) / income, PAC is not an expense", () => {
    const [feb] = monthlyStats(txs);
    expect(feb.savingsRate).toBeCloseTo(75);
    expect(feb.invested).toBe(300);
  });
  it("month without income has no rate (n.d.)", () => {
    expect(monthlyStats(txs)[1].savingsRate).toBeNull();
  });
  it("groups expenses by category, filterable by month", () => {
    expect(expensesByCategory(txs)).toEqual([{ category: "food", total: 300 }, { category: "fun", total: 30 }]);
    expect(expensesByCategory(txs, "2026-03")).toEqual([{ category: "food", total: 50 }, { category: "fun", total: 30 }]);
  });
});

describe("PAC projection", () => {
  it("rate 0: linear", () => {
    const pts = projectPac(1000, 100, 0, 2);
    expect(pts[2].value).toBe(1000 + 100 * 24);
    expect(pts[2].contributed).toBe(pts[2].value);
  });
  it("starts at the starting capital", () => {
    expect(projectPac(500, 50, 0.05, 1)[0].value).toBe(500);
  });
  it("lump sum only compounds annually at the given rate", () => {
    expect(projectPac(1000, 0, 0.05, 1)[1].value).toBeCloseTo(1050, 6);
  });
  it("grows more than contributions at positive rate", () => {
    const last = projectPac(1000, 100, 0.05, 20).at(-1)!;
    expect(last.value).toBeGreaterThan(last.contributed);
  });
});

describe("actions", () => {
  it("setManualValue stamps today", () => {
    expect(setManualValue(10, "2026-05-01")).toEqual({ manualValue: 10, manualValueAt: "2026-05-01" });
  });
  it("estimateUnits needs a price", () => {
    expect(estimateUnits(100, 20)).toBe(5);
    expect(estimateUnits(100, null)).toBeNull();
  });
  it("collectReceivable moves its value into the chosen liquidity asset", () => {
    const cash = computeAsset(asset({ id: "cash", class: "liquidity", manualValue: 100 }), []);
    const debt = computeAsset(asset({ id: "debt", class: "receivable", manualValue: 40 }), []);
    const r = collectReceivable(debt, cash, "2026-05-01");
    expect(r.targetPatch.manualValue).toBe(140);
    expect(r.deleteId).toBe("debt");
  });
  it("collectReceivable rejects a non-liquidity target", () => {
    const etf = computeAsset(asset({ id: "e", class: "etf" }), []);
    const debt = computeAsset(asset({ id: "d", class: "receivable" }), []);
    expect(() => collectReceivable(debt, etf, "2026-05-01")).toThrow();
  });
});
