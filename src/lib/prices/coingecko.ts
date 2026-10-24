import type { Candidate, FetchLike, PriceProvider, Quote } from "./types";

// CoinGecko Demo plan: 100 calls/min, 10k/month, attribution required (shown in the app footer).
// One /simple/price call serves every tracked coin. The key is optional: without it the public endpoint is used.
const BASE = "https://api.coingecko.com/api/v3";

const headers = (key?: string): Record<string, string> => (key ? { "x-cg-demo-api-key": key } : {});

export function coingecko(opts: { apiKey?: string; dailyLimit?: number; fetchFn?: FetchLike; today?: () => string } = {}): PriceProvider {
  const f = opts.fetchFn ?? fetch;
  const today = opts.today ?? (() => new Date().toISOString().slice(0, 10));
  return {
    name: "coingecko",
    dailyLimit: opts.dailyLimit ?? 300,
    batched: true,
    async fetchLatest(ids) {
      const out = new Map<string, Quote>();
      if (!ids.length) return out;
      try {
        const url = `${BASE}/simple/price?ids=${ids.map(encodeURIComponent).join(",")}&vs_currencies=eur&include_last_updated_at=true`;
        const res = await f(url, { headers: headers(opts.apiKey), signal: AbortSignal.timeout(10_000) });
        if (!res.ok) return out;
        const body = (await res.json()) as Record<string, { eur?: number; last_updated_at?: number }>;
        for (const id of ids) {
          const eur = body[id]?.eur;
          if (typeof eur !== "number" || !(eur > 0)) continue;
          const ts = body[id]?.last_updated_at;
          // Crypto trades 24/7: the price date is the day of the quote itself (UTC).
          out.set(id, { date: ts ? new Date(ts * 1000).toISOString().slice(0, 10) : today(), close: eur, currency: "EUR" });
        }
      } catch {
        /* network error: ids stay missing, the caller falls back / reports */
      }
      return out;
    },
  };
}

export async function searchCoingecko(query: string, opts: { apiKey?: string; fetchFn?: FetchLike } = {}): Promise<Candidate[]> {
  const f = opts.fetchFn ?? fetch;
  try {
    const res = await f(`${BASE}/search?query=${encodeURIComponent(query)}`, { headers: headers(opts.apiKey), signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return [];
    const body = (await res.json()) as { coins?: { id: string; name: string; symbol: string }[] };
    return (body.coins ?? []).slice(0, 8).map((c) => ({
      kind: "crypto" as const, name: c.name, symbol: c.symbol.toUpperCase(), currency: "EUR", provider: "coingecko", providerId: c.id,
    }));
  } catch {
    return [];
  }
}
