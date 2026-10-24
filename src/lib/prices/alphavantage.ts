import type { FetchLike, PriceProvider, Quote } from "./types";

// Alpha Vantage free key: 25 calls/day. Used as the fallback for symbols EODHD cannot serve (e.g. "VWCE.DEX").
// "compact" output (last 100 days) is the free one. Throttling arrives as a 200 with a "Note"/"Information" field, not as an HTTP error.
const BASE = "https://www.alphavantage.co/query";

export function alphavantage(opts: { apiKey: string; dailyLimit?: number; fetchFn?: FetchLike }): PriceProvider {
  const f = opts.fetchFn ?? fetch;
  return {
    name: "alphavantage",
    dailyLimit: opts.dailyLimit ?? 25,
    batched: false,
    async fetchLatest(ids) {
      const out = new Map<string, Quote>();
      // Sequential: the free key is also limited per minute.
      for (const id of ids) {
        try {
          const res = await f(`${BASE}?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(id)}&outputsize=compact&apikey=${opts.apiKey}`, { signal: AbortSignal.timeout(15_000) });
          if (!res.ok) continue;
          const body = (await res.json()) as { "Time Series (Daily)"?: Record<string, Record<string, string>> };
          const series = body["Time Series (Daily)"];
          if (!series) break; // throttled or unknown symbol: stop spending calls
          const date = Object.keys(series).sort().at(-1);
          const close = date ? Number(series[date]["4. close"]) : NaN;
          if (date && close > 0) out.set(id, { date, close });
        } catch {
          /* leave the id missing */
        }
      }
      return out;
    },
  };
}
