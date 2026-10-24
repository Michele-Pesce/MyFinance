import type { Candidate, FetchLike, PriceProvider, Quote } from "./types";

// EODHD free plan: 20 calls/day, end-of-day only, 1 year of history. One call per symbol; a search costs one call too.
// Symbols look like "VWCE.XETRA" (code.exchange). The API key travels in the query string: never log or rethrow URLs.
const BASE = "https://eodhd.com/api";

/** EODHD exchange code -> Alpha Vantage suffix, for the few exchanges where we know the mapping. */
const AV_SUFFIX: Record<string, string> = { XETRA: "DEX", LSE: "LON" };

export function eodhd(opts: { apiKey: string; dailyLimit?: number; fetchFn?: FetchLike; now?: () => Date }): PriceProvider {
  const f = opts.fetchFn ?? fetch;
  const now = opts.now ?? (() => new Date());
  return {
    name: "eodhd",
    dailyLimit: opts.dailyLimit ?? 20,
    batched: false,
    async fetchLatest(ids) {
      const out = new Map<string, Quote>();
      const from = new Date(now().getTime() - 10 * 86_400_000).toISOString().slice(0, 10); // covers weekends and holidays
      await Promise.all(ids.map(async (id) => {
        try {
          const res = await f(`${BASE}/eod/${encodeURIComponent(id)}?api_token=${opts.apiKey}&fmt=json&period=d&order=d&from=${from}`, { signal: AbortSignal.timeout(10_000) });
          if (!res.ok) return;
          const rows = (await res.json()) as { date?: string; close?: number }[];
          const last = Array.isArray(rows) ? rows[0] : undefined; // order=d: newest first
          if (last?.date && typeof last.close === "number" && last.close > 0) out.set(id, { date: last.date, close: last.close });
        } catch {
          /* leave the id missing */
        }
      }));
      return out;
    },
  };
}

interface EodhdSearchItem { Code: string; Exchange: string; Name: string; Type: string; Currency: string; ISIN?: string | null }

/** Search by ISIN, ticker or name. Only ETFs and common stocks. */
export async function searchEodhd(query: string, opts: { apiKey: string; fetchFn?: FetchLike }): Promise<Candidate[]> {
  const f = opts.fetchFn ?? fetch;
  try {
    const res = await f(`${BASE}/search/${encodeURIComponent(query)}?api_token=${opts.apiKey}&fmt=json&limit=10`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return [];
    const items = (await res.json()) as EodhdSearchItem[];
    return (Array.isArray(items) ? items : [])
      .filter((i) => i.Type === "ETF" || i.Type === "Common Stock")
      .map((i) => {
        const suffix = AV_SUFFIX[i.Exchange];
        return {
          kind: i.Type === "ETF" ? ("etf" as const) : ("stock" as const),
          name: i.Name, symbol: i.Code, isin: i.ISIN ?? null, exchange: i.Exchange, currency: i.Currency || "EUR",
          provider: "eodhd", providerId: `${i.Code}.${i.Exchange}`,
          altProvider: suffix ? "alphavantage" : null, altProviderId: suffix ? `${i.Code}.${suffix}` : null,
        };
      });
  } catch {
    return [];
  }
}
