// Fictional demo data for /demo. Invented figures: they are never anyone's real data.
import type { AppData } from "./data";
import type { Asset, Snapshot, Transaction } from "./types";

const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);

export function demoData(now = new Date()): AppData {
  const Y = now.getUTCFullYear(), M = now.getUTCMonth();
  const asset = (a: Partial<Asset> & Pick<Asset, "id" | "name" | "class">): Asset => ({ monthlyContribution: 0, initialInvested: 0, initialUnits: 0, manualValue: 0, ...a });
  const assets: Asset[] = [
    asset({ id: "d-cash", name: "Conto principale", class: "liquidity", color: "green", platform: "Banca demo", manualValue: 3200 }),
    asset({ id: "d-etf", name: "ETF azionario globale", class: "etf", color: "blue", platform: "Broker demo", monthlyContribution: 200, initialInvested: 4000, initialUnits: 40, manualPrice: 108 }),
    asset({ id: "d-bond", name: "ETF obbligazionario", class: "bond", color: "purple", platform: "Broker demo", monthlyContribution: 50, initialInvested: 1000, initialUnits: 20, manualPrice: 49 }),
    asset({ id: "d-btc", name: "Bitcoin", class: "crypto", color: "orange", platform: "Exchange demo", manualValue: 650 }),
    asset({ id: "d-debt", name: "Prestito a un amico", class: "receivable", color: "yellow", manualValue: 120 }),
  ];

  const transactions: Transaction[] = [];
  let n = 0;
  const add = (t: Omit<Transaction, "id">) => transactions.push({ id: `d-t${n++}`, ...t });
  const cats = [["Spesa casa", 210], ["Cibo fuori", 95], ["Carburante", 60], ["Abbonamenti", 28], ["Svago", 75]] as const;
  for (let k = 5; k >= 0; k--) {
    const m = M - k;
    add({ date: iso(Y, m, 1), type: "income", category: "Lavoro", description: "Stipendio", amount: 1450 });
    if (k % 2 === 0) add({ date: iso(Y, m, 14), type: "income", category: "Extra", description: "Lavoretto", amount: 180 });
    cats.forEach(([c, a], i) => add({ date: iso(Y, m, 3 + i * 5), type: "expense", category: c, amount: a + ((k * 17 + i * 11) % 40) }));
    add({ date: iso(Y, m, 5), type: "pac", description: "PAC", amount: 200, assetId: "d-etf", units: 200 / 105 });
    add({ date: iso(Y, m, 5), type: "pac", description: "PAC", amount: 50, assetId: "d-bond", units: 50 / 49 });
  }

  const snapshots: Snapshot[] = [5, 4, 3, 2, 1].map((k, i) => ({
    id: `d-s${i}`, date: iso(Y, M - k, 28), netWorth: 7600 + i * 420 + (i % 2) * 90, liquidity: 2800 + i * 60, invested: 4200 + i * 330, crypto: 600 + i * 10, receivables: 120, source: "auto" as const,
  }));

  return {
    assets, transactions, snapshots, prices: {}, priceDates: {}, instruments: {},
    categories: [],
  };
}
