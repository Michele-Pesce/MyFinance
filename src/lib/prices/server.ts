import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computePortfolio } from "@/lib/calc";
import { loadData } from "@/lib/data";
import { alphavantage } from "./alphavantage";
import { coingecko } from "./coingecko";
import { eodhd } from "./eodhd";
import type { PriceProvider, PriceStore, TrackedInstrument } from "./types";

const int = (v: string | undefined, fallback: number) => (v && Number.isFinite(Number(v)) ? Number(v) : fallback);

/** Providers with a configured key (CoinGecko works without one). Limits can be raised via env if the plan changes. */
export function buildProviders(env: NodeJS.ProcessEnv = process.env): Record<string, PriceProvider> {
  const out: Record<string, PriceProvider> = {
    coingecko: coingecko({ apiKey: env.COINGECKO_API_KEY || undefined, dailyLimit: int(env.COINGECKO_DAILY_LIMIT, 300) }),
  };
  if (env.EODHD_API_KEY) out.eodhd = eodhd({ apiKey: env.EODHD_API_KEY, dailyLimit: int(env.EODHD_DAILY_LIMIT, 20) });
  if (env.ALPHAVANTAGE_API_KEY) out.alphavantage = alphavantage({ apiKey: env.ALPHAVANTAGE_API_KEY, dailyLimit: int(env.ALPHAVANTAGE_DAILY_LIMIT, 25) });
  return out;
}

/** Shared market data lives in instruments/prices: only the service role writes them. */
export function supabaseStore(admin: SupabaseClient): PriceStore {
  return {
    async trackedInstruments() {
      // Only instruments some user actually holds: no point spending the free budget on the others.
      const { data: linked, error } = await admin.from("assets").select("instrument_id").eq("archived", false).not("instrument_id", "is", null);
      if (error) throw new Error(error.message);
      const ids = [...new Set((linked ?? []).map((a) => a.instrument_id as string))];
      if (!ids.length) return [];
      const [ins, last] = await Promise.all([
        admin.from("instruments").select("id, kind, currency, provider, provider_id, alt_provider, alt_provider_id").eq("active", true).in("id", ids),
        admin.from("prices").select("instrument_id, date").in("instrument_id", ids).order("date", { ascending: false }).limit(ids.length * 10),
      ]);
      if (ins.error) throw new Error(ins.error.message);
      const lastDate: Record<string, string> = {};
      for (const p of last.data ?? []) lastDate[p.instrument_id] ??= p.date;
      return (ins.data ?? []).map((i): TrackedInstrument => ({
        id: i.id, kind: i.kind, currency: i.currency, provider: i.provider, providerId: i.provider_id,
        altProvider: i.alt_provider, altProviderId: i.alt_provider_id, lastDate: lastDate[i.id] ?? null,
      }));
    },
    async callsUsed(provider, date) {
      const { data } = await admin.from("provider_calls").select("count").eq("provider", provider).eq("date", date).maybeSingle();
      return data?.count ?? 0;
    },
    async addCalls(provider, date, n) {
      const { error } = await admin.rpc("bump_provider_calls", { p_provider: provider, p_date: date, p_n: n });
      if (error) throw new Error(error.message);
    },
    async upsertPrices(rows) {
      const { error } = await admin.from("prices").upsert(rows.map((r) => ({ ...r, fetched_at: new Date().toISOString() })), { onConflict: "instrument_id,date" });
      if (error) throw new Error(error.message);
    },
  };
}

/**
 * Daily automatic snapshot per user (source = 'auto'). A manual snapshot of the same day is kept as is
 * (ignoreDuplicates), so the user's own number is never overwritten by the job.
 */
export async function runAutoSnapshots(admin: SupabaseClient, date: string): Promise<{ users: number; saved: number }> {
  const { data: users, error } = await admin.from("profiles").select("user_id");
  if (error) throw new Error(error.message);
  const r = (n: number) => Math.round(n * 100) / 100;
  let saved = 0;
  for (const { user_id } of users ?? []) {
    const d = await loadData(admin, user_id);
    if (!d.assets.length) continue;
    const p = computePortfolio(d.assets, d.transactions, d.prices);
    // Re-running the job replaces that day's earlier auto snapshot (fixes a wrong one); a manual snapshot is never touched.
    await admin.from("snapshots").delete().eq("user_id", user_id).eq("date", date).eq("source", "auto");
    const { error: e } = await admin.from("snapshots").upsert(
      { user_id, date, net_worth: r(p.netWorth), liquidity: r(p.liquidity), invested: r(p.invested), crypto: r(p.crypto), receivables: r(p.receivables), source: "auto" },
      { onConflict: "user_id,date", ignoreDuplicates: true },
    );
    if (!e) saved++;
  }
  return { users: users?.length ?? 0, saved };
}
