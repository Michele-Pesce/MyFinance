import type { SupabaseClient } from "@supabase/supabase-js";
import type { Asset, AssetClass, PriceMap, Snapshot, Transaction, TxType } from "./types";

// DB rows (snake_case) -> domain objects (camelCase). Numeric columns arrive as JS numbers from PostgREST.
/* eslint-disable @typescript-eslint/no-explicit-any */
const toAsset = (r: any): Asset => ({
  id: r.id, name: r.name, class: r.class as AssetClass, platform: r.platform, color: r.color, groupLabel: r.group_label,
  instrumentId: r.instrument_id, monthlyContribution: Number(r.monthly_contribution), initialInvested: Number(r.initial_invested),
  initialUnits: Number(r.initial_units), manualPrice: r.manual_price == null ? null : Number(r.manual_price),
  manualValue: Number(r.manual_value), manualValueAt: r.manual_value_at, archived: r.archived,
});
const toTx = (r: any): Transaction => ({
  id: r.id, date: r.date, type: r.type as TxType, category: r.category, description: r.description, amount: Number(r.amount),
  assetId: r.asset_id, units: r.units == null ? null : Number(r.units), unitsEstimated: r.units_estimated,
});
const toSnapshot = (r: any): Snapshot => ({
  id: r.id, date: r.date, netWorth: Number(r.net_worth), liquidity: Number(r.liquidity), invested: Number(r.invested),
  crypto: Number(r.crypto), receivables: Number(r.receivables), source: r.source,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface Category { id: string; kind: "expense" | "income"; name: string; sort: number }
export interface PriceInfo { close: number; date: string }

export interface AppData {
  assets: Asset[];
  transactions: Transaction[];
  snapshots: Snapshot[];
  categories: Category[];
  prices: PriceMap;
  priceDates: Record<string, string>; // instrument id -> date of the latest price, for the "updated on" label
  instruments: Record<string, { name: string; symbol: string | null; provider: string }>; // linked instruments, by id
}

/**
 * Reads everything the pages need. With the user's own client RLS already scopes the rows; the optional `userId`
 * is for the service-role client (daily snapshot job), which bypasses RLS and must filter explicitly.
 */
export async function loadData(supabase: SupabaseClient, userId?: string): Promise<AppData> {
  let qa = supabase.from("assets").select("*");
  let qt = supabase.from("transactions").select("*");
  let qs = supabase.from("snapshots").select("*");
  let qc = supabase.from("categories").select("id, kind, name, sort");
  if (userId) { qa = qa.eq("user_id", userId); qt = qt.eq("user_id", userId); qs = qs.eq("user_id", userId); qc = qc.eq("user_id", userId); }
  const [assets, txs, snaps, cats] = await Promise.all([
    qa.order("created_at"),
    qt.order("date", { ascending: false }).limit(5000),
    qs.order("date"),
    qc.order("sort"),
  ]);
  for (const r of [assets, txs, snaps, cats]) if (r.error) throw new Error(r.error.message);

  const assetList = (assets.data ?? []).map(toAsset);
  const instrumentIds = [...new Set(assetList.map((a) => a.instrumentId).filter((x): x is string => !!x))];

  // Latest price per linked instrument. A missing or stale price never breaks the page: the UI warns instead.
  const prices: PriceMap = {};
  const priceDates: Record<string, string> = {};
  const instruments: AppData["instruments"] = {};
  if (instrumentIds.length) {
    const { data: ins } = await supabase.from("instruments").select("id, name, symbol, provider").in("id", instrumentIds);
    for (const i of ins ?? []) instruments[i.id] = { name: i.name, symbol: i.symbol, provider: i.provider };
    const { data } = await supabase.from("prices").select("instrument_id, date, close").in("instrument_id", instrumentIds).order("date", { ascending: false }).limit(instrumentIds.length * 10);
    for (const p of data ?? []) {
      if (prices[p.instrument_id] === undefined) {
        prices[p.instrument_id] = Number(p.close);
        priceDates[p.instrument_id] = p.date;
      }
    }
  }

  return {
    assets: assetList,
    transactions: (txs.data ?? []).map(toTx),
    snapshots: (snaps.data ?? []).map(toSnapshot),
    categories: (cats.data ?? []) as Category[],
    prices,
    priceDates,
    instruments,
  };
}
