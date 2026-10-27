// Pure portfolio maths (handoff section 5). No I/O, no Date.now(): everything comes in as arguments.
import type { Asset, AssetClass, PriceMap, Transaction } from "../types";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

const isInvestment = (t: Transaction) => t.type === "pac" || t.type === "lump_sum";

/**
 * Effect of a transaction on the value of the asset it is linked to: PAC / lump sum add to it, and so does income.
 * An expense takes money out of the (liquidity) account it was paid from. Transactions with no linked asset change nothing.
 */
const signedAmount = (t: Transaction) => (t.type === "expense" ? -t.amount : t.amount);

/** Display order of the classes in the portfolio view. */
export const CLASS_ORDER: AssetClass[] = ["liquidity", "etf", "bond", "stock", "crypto", "other", "receivable"];

/** Classes treated as "ETF" for the ETF return summary and the PAC projection. */
const ETF_LIKE: AssetClass[] = ["etf", "bond"];
const INVESTED: AssetClass[] = ["etf", "stock", "bond", "other"];

export interface AssetRow extends Asset {
  invested: number; // "versato"
  units: number;
  value: number;
  price: number | null; // price used for the value, null when value is manual
  gain: number | null; // null = not available (invested <= 0), never 0
  gainPct: number | null;
}

export interface PortfolioSummary {
  rows: AssetRow[];
  netWorth: number; // excludes receivables
  liquidity: number;
  invested: number;
  crypto: number;
  receivables: number;
  etfGain: number | null;
  etfGainPct: number | null;
  etfValue: number; // starting capital of the PAC projection
  monthlyPac: number; // sum of planned monthly contributions
}

/** Automatic price of the linked instrument wins; otherwise a manual price > 0; otherwise null. */
export function priceFor(asset: Asset, prices: PriceMap): number | null {
  const auto = asset.instrumentId ? prices[asset.instrumentId] : undefined;
  if (auto !== undefined && auto > 0) return auto;
  if (asset.manualPrice != null && asset.manualPrice > 0) return asset.manualPrice;
  return null;
}

export function computeAsset(asset: Asset, txs: Transaction[], prices: PriceMap = {}): AssetRow {
  const mv = txs.filter((t) => t.assetId === asset.id && isInvestment(t));
  const invested = asset.initialInvested + sum(mv.map((t) => t.amount));
  const units = asset.initialUnits + sum(mv.map((t) => t.units ?? 0));
  // A price is only usable with units to multiply it by. An asset tracked by its manual value alone (no units yet) keeps
  // that value when a price feed is linked, instead of collapsing to units x price = 0.
  const feed = priceFor(asset, prices);
  const price = feed !== null && units > 0 ? feed : null;

  let value: number;
  if (price !== null) {
    value = units * price;
  } else {
    // Manual value plus everything linked to the asset after it was last set (all of it when never set):
    // contributions, and for a liquidity account the income and expenses booked on it.
    const after = txs.filter((t) => t.assetId === asset.id && (!asset.manualValueAt || t.date > asset.manualValueAt));
    value = asset.manualValue + sum(after.map(signedAmount));
  }

  const hasCost = invested > 0;
  return {
    ...asset,
    invested,
    units,
    value,
    price,
    gain: hasCost ? value - invested : null,
    gainPct: hasCost ? (value / invested - 1) * 100 : null,
  };
}

export function computePortfolio(assets: Asset[], txs: Transaction[], prices: PriceMap = {}): PortfolioSummary {
  const rows = assets
    .filter((a) => !a.archived)
    .map((a) => computeAsset(a, txs, prices))
    .sort((a, b) => CLASS_ORDER.indexOf(a.class) - CLASS_ORDER.indexOf(b.class) || b.value - a.value);

  // Receivables are money others owe the user: shown apart, never part of net worth.
  const core = rows.filter((r) => r.class !== "receivable");
  const valueOf = (classes: AssetClass[]) => sum(core.filter((r) => classes.includes(r.class)).map((r) => r.value));

  const etf = core.filter((r) => ETF_LIKE.includes(r.class));
  const etfWithCost = etf.filter((r) => r.invested > 0); // avoids skewing the % with unknown cost basis
  const etfInvested = sum(etfWithCost.map((r) => r.invested));
  const etfCurrent = sum(etfWithCost.map((r) => r.value));

  return {
    rows,
    netWorth: sum(core.map((r) => r.value)),
    liquidity: valueOf(["liquidity"]),
    invested: valueOf(INVESTED),
    crypto: valueOf(["crypto"]),
    receivables: sum(rows.filter((r) => r.class === "receivable").map((r) => r.value)),
    etfGain: etfInvested > 0 ? etfCurrent - etfInvested : null,
    etfGainPct: etfInvested > 0 ? (etfCurrent / etfInvested - 1) * 100 : null,
    etfValue: sum(etf.map((r) => r.value)),
    monthlyPac: sum(core.map((r) => r.monthlyContribution)),
  };
}
