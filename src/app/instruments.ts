"use server";

import { createHmac, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { searchCoingecko } from "@/lib/prices/coingecko";
import { searchEodhd } from "@/lib/prices/eodhd";
import { upsertInstrument } from "@/lib/prices/resolve";
import { supabaseStore } from "@/lib/prices/server";
import type { Candidate } from "@/lib/prices/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { allow } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./actions";

// Linking an asset to a tracked price. instruments/prices are shared and written only with the service role,
// so the client can't invent instruments: search results are HMAC-signed here and verified again when linking.
// Otherwise any user could add arbitrary symbols and burn the shared free-plan budget.

export type SignedCandidate = { c: Candidate; sig: string };
export type SearchResult = { ok: true; results: SignedCandidate[] } | { ok: false; error: string };

const sign = (c: Candidate) => {
  const secret = process.env.INSTRUMENT_SIGNING_SECRET;
  if (!secret) throw new Error("INSTRUMENT_SIGNING_SECRET not set");
  const canon = [c.kind, c.provider, c.providerId, c.currency, c.altProvider ?? "", c.altProviderId ?? "", c.name, c.symbol, c.isin ?? "", c.exchange ?? ""].join("|");
  return createHmac("sha256", secret).update(canon).digest("hex");
};

async function authed() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("unauthenticated");
  return { supabase, userId: data.user.id };
}

const todayUtc = () => new Date().toISOString().slice(0, 10);

/** mode "crypto" -> CoinGecko, otherwise EODHD (ISIN, ticker or name). */
export async function searchInstruments(query: string, mode: "crypto" | "market"): Promise<SearchResult> {
  const { userId } = await authed();
  // One user must not be able to eat the shared free-plan budget: stock/ETF searches cost a provider call each.
  if (!(await allow(["search", mode, userId], mode === "market" ? 8 : 40, mode === "market" ? 86_400 : 3_600))) return { ok: false, error: "error.rateLimit" };
  const q = z.string().trim().min(2).max(60).safeParse(query);
  if (!q.success) return { ok: false, error: "error.invalid" };
  if (!process.env.INSTRUMENT_SIGNING_SECRET) return { ok: false, error: "error.notConfigured" };

  let found: Candidate[];
  if (mode === "crypto") {
    found = await searchCoingecko(q.data, { apiKey: process.env.COINGECKO_API_KEY || undefined });
  } else {
    const key = process.env.EODHD_API_KEY;
    if (!key) return { ok: false, error: "error.noProvider" };
    // A search costs one call from the same free daily budget as the price job: keep enough for tracked instruments.
    const admin = createAdminClient();
    const store = supabaseStore(admin);
    const limit = Number(process.env.EODHD_DAILY_LIMIT) || 20;
    const [used, tracked] = await Promise.all([store.callsUsed("eodhd", todayUtc()), store.trackedInstruments()]);
    if (used + tracked.filter((t) => t.provider === "eodhd").length >= limit) return { ok: false, error: "error.searchBudget" };
    await store.addCalls("eodhd", todayUtc(), 1);
    found = await searchEodhd(q.data, { apiKey: key });
  }
  return { ok: true, results: found.map((c) => ({ c, sig: sign(c) })) };
}

const candidateSchema = z.object({
  kind: z.enum(["etf", "stock", "crypto"]), name: z.string().max(200), symbol: z.string().max(40), isin: z.string().max(20).nullish(), exchange: z.string().max(20).nullish(),
  currency: z.string().length(3).or(z.literal("GBX")), provider: z.enum(["eodhd", "coingecko"]), providerId: z.string().max(80),
  altProvider: z.enum(["alphavantage"]).nullish(), altProviderId: z.string().max(80).nullish(),
});

export async function linkInstrument(assetId: string, signed: SignedCandidate): Promise<ActionResult> {
  const { supabase, userId } = await authed();
  if (!(await allow(["link", userId], 30, 3_600))) return { ok: false, error: "error.rateLimit" };
  const id = z.string().uuid().safeParse(assetId);
  const parsed = candidateSchema.safeParse(signed.c);
  if (!id.success || !parsed.success) return { ok: false, error: "error.invalid" };
  const c = parsed.data as Candidate;

  let valid = false;
  try {
    const expected = Buffer.from(sign(c), "hex");
    const given = Buffer.from(signed.sig ?? "", "hex");
    valid = expected.length === given.length && timingSafeEqual(expected, given);
  } catch {
    return { ok: false, error: "error.notConfigured" };
  }
  if (!valid) return { ok: false, error: "error.invalid" };

  const instId = await upsertInstrument(createAdminClient(), c);
  if (!instId) return { ok: false, error: "error.save" };

  // The user's own client: RLS guarantees the asset is theirs.
  const { error: e2 } = await supabase.from("assets").update({ instrument_id: instId }).eq("id", id.data);
  if (e2) return { ok: false, error: "error.save" };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function unlinkInstrument(assetId: string): Promise<ActionResult> {
  const { supabase } = await authed();
  const { error } = await supabase.from("assets").update({ instrument_id: null }).eq("id", z.string().uuid().parse(assetId));
  if (error) return { ok: false, error: "error.save" };
  revalidatePath("/", "layout");
  return { ok: true };
}
