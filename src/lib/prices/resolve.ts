import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssetClass } from "../types";
import { searchCoingecko } from "./coingecko";
import { searchEodhd } from "./eodhd";
import { pickCandidate, TRACKABLE } from "./pick";
import { supabaseStore } from "./server";
import type { Candidate } from "./types";

const today = () => new Date().toISOString().slice(0, 10);

/** Shared market data is written with the service role only. Same instrument twice = same row. */
export async function upsertInstrument(admin: SupabaseClient, c: Candidate): Promise<string | null> {
  const { data, error } = await admin.from("instruments").upsert({
    kind: c.kind, isin: c.isin ?? null, symbol: c.symbol, exchange: c.exchange ?? null, currency: c.currency, provider: c.provider,
    provider_id: c.providerId, name: c.name, alt_provider: c.altProvider ?? null, alt_provider_id: c.altProviderId ?? null, active: true,
  }, { onConflict: "provider,provider_id" }).select("id").single();
  return error || !data ? null : (data.id as string);
}

export interface LinkTarget { assetId: string; cls: AssetClass; tracker: string }

/**
 * CSV import: turns each asset's tracker cell (ISIN or ticker for ETF/stock, symbol for crypto) into a linked price feed.
 * Stock/ETF searches cost one call of the shared free EODHD budget: same guard as the manual search, and it stops (leaving the
 * rest unlinked) rather than starving the daily price job. Returns how many were linked; the others are linked by hand later.
 */
export async function resolveAndLink(admin: SupabaseClient, user: SupabaseClient, targets: LinkTarget[]): Promise<{ linked: number; unresolved: number }> {
  const store = supabaseStore(admin);
  const key = process.env.EODHD_API_KEY;
  const limit = Number(process.env.EODHD_DAILY_LIMIT) || 20;
  const tracked = (await store.trackedInstruments()).filter((t) => t.provider === "eodhd").length;
  let used = await store.callsUsed("eodhd", today());
  let linked = 0;

  for (const t of targets) {
    if (!TRACKABLE.includes(t.cls)) continue;
    let results: Candidate[] = [];
    if (t.cls === "crypto") {
      results = await searchCoingecko(t.tracker, { apiKey: process.env.COINGECKO_API_KEY || undefined });
    } else {
      if (!key || used + tracked >= limit) continue; // no key or no budget left today
      used++;
      await store.addCalls("eodhd", today(), 1);
      results = await searchEodhd(t.tracker, { apiKey: key });
    }
    const pick = pickCandidate(t.tracker, t.cls, results);
    const id = pick ? await upsertInstrument(admin, pick) : null;
    if (!id) continue;
    const { error } = await user.from("assets").update({ instrument_id: id }).eq("id", t.assetId); // RLS: only the user's own asset
    if (!error) linked++;
  }
  return { linked, unresolved: targets.filter((t) => TRACKABLE.includes(t.cls)).length - linked };
}
