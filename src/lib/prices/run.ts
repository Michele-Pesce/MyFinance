import { fetchEcbRates, toEur, type FxRates } from "./fx";
import type { PriceProvider, PriceRow, PriceStore, Quote, TrackedInstrument } from "./types";

export interface RunSummary {
  updated: number;
  missing: number; // tracked instruments left without a fresh price (budget, failure or no key)
  providers: Record<string, { calls: number; ok: number }>;
}

export interface RunDeps {
  providers: Record<string, PriceProvider>;
  store: PriceStore;
  today: string; // UTC date YYYY-MM-DD, also the day the call budgets are counted on
  fx?: () => Promise<FxRates>;
}

const isWeekend = (iso: string) => [0, 6].includes(new Date(iso + "T00:00:00Z").getUTCDay());

/**
 * Daily job. Stalest instruments first so that, when the free budget is smaller than the tracked list, every
 * instrument still gets refreshed in rotation. Primary provider first, then each instrument's fallback.
 * Idempotent: prices upsert on (instrument_id, date). Logs counts only, never prices.
 */
export async function runPriceUpdate({ providers, store, today, fx = fetchEcbRates }: RunDeps): Promise<RunSummary> {
  const tracked = (await store.trackedInstruments())
    // Stock markets are closed at the weekend: don't burn calls on them. Crypto trades every day.
    .filter((i) => !(isWeekend(today) && i.kind !== "crypto"))
    .sort((a, b) => (a.lastDate ?? "").localeCompare(b.lastDate ?? ""));

  const summary: RunSummary = { updated: 0, missing: 0, providers: {} };
  const got = new Map<string, { inst: TrackedInstrument; quote: Quote }>();

  for (const stage of ["primary", "alt"] as const) {
    const byProvider = new Map<string, { inst: TrackedInstrument; pid: string }[]>();
    for (const inst of tracked) {
      if (got.has(inst.id)) continue;
      const name = stage === "primary" ? inst.provider : inst.altProvider;
      const pid = stage === "primary" ? inst.providerId : inst.altProviderId;
      if (!name || !pid) continue;
      byProvider.set(name, [...(byProvider.get(name) ?? []), { inst, pid }]);
    }

    for (const [name, items] of byProvider) {
      const provider = providers[name];
      if (!provider) continue; // no API key configured
      const left = provider.dailyLimit - (await store.callsUsed(name, today));
      const batch = provider.batched ? (left >= 1 ? items : []) : items.slice(0, Math.max(0, left));
      if (!batch.length) continue;

      const quotes = await provider.fetchLatest(batch.map((b) => b.pid));
      const calls = provider.batched ? 1 : batch.length;
      await store.addCalls(name, today, calls);
      const stat = (summary.providers[name] ??= { calls: 0, ok: 0 });
      stat.calls += calls;
      for (const { inst, pid } of batch) {
        const q = quotes.get(pid);
        if (q && Number.isFinite(q.close) && q.close > 0 && /^\d{4}-\d{2}-\d{2}$/.test(q.date)) {
          got.set(inst.id, { inst, quote: q });
          stat.ok++;
        }
      }
    }
  }

  // Convert to EUR (fetching the ECB rates only when something is quoted in another currency).
  let rates: FxRates | null = null;
  let ratesTried = false;
  const rows: PriceRow[] = [];
  for (const { inst, quote } of got.values()) {
    const currency = quote.currency ?? inst.currency;
    if (currency !== "EUR" && !ratesTried) {
      ratesTried = true;
      rates = await fx().catch(() => null);
    }
    try {
      rows.push({ instrument_id: inst.id, date: quote.date, close: toEur(quote.close, currency, rates), close_native: quote.close, currency_native: currency });
    } catch {
      /* no usable rate: leave this instrument for the next run */
    }
  }
  if (rows.length) await store.upsertPrices(rows);

  summary.updated = rows.length;
  summary.missing = tracked.length - rows.length;
  return summary;
}
