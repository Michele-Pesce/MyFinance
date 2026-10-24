import { describe, expect, it, vi } from "vitest";
import { alphavantage } from "./alphavantage";
import { coingecko, searchCoingecko } from "./coingecko";
import { eodhd, searchEodhd } from "./eodhd";
import { parseEcbXml, toEur } from "./fx";
import { runPriceUpdate } from "./run";
import type { PriceProvider, PriceRow, PriceStore, TrackedInstrument } from "./types";

const json = (body: unknown, ok = true) => vi.fn(async () => ({ ok, status: ok ? 200 : 500, json: async () => body, text: async () => JSON.stringify(body) }) as Response);

describe("ECB / fx", () => {
  const xml = `<Cube><Cube time='2026-10-23'><Cube currency='USD' rate='1.2'/><Cube currency='GBP' rate='0.8'/></Cube></Cube>`;
  it("parses date and rates", () => expect(parseEcbXml(xml)).toEqual({ date: "2026-10-23", rates: { USD: 1.2, GBP: 0.8 } }));
  it("rejects garbage", () => expect(() => parseEcbXml("<x/>")).toThrow());
  it("converts to EUR, pence included", () => {
    const fx = parseEcbXml(xml);
    expect(toEur(12, "USD", fx)).toBeCloseTo(10);
    expect(toEur(8000, "GBX", fx)).toBeCloseTo(100); // 80 GBP / 0.8
    expect(toEur(5, "EUR", null)).toBe(5);
    expect(() => toEur(1, "CHF", fx)).toThrow();
  });
});

describe("providers", () => {
  it("coingecko: one batched call, drops unknown ids, sends the demo key header", async () => {
    const f = json({ bitcoin: { eur: 70000, last_updated_at: 1792839252 } });
    const q = await coingecko({ apiKey: "K", fetchFn: f }).fetchLatest(["bitcoin", "nope"]);
    expect(f).toHaveBeenCalledTimes(1);
    expect((f.mock.calls[0] as unknown[])[1]).toMatchObject({ headers: { "x-cg-demo-api-key": "K" } });
    expect(q.get("bitcoin")).toMatchObject({ close: 70000, currency: "EUR" });
    expect(q.has("nope")).toBe(false);
  });
  it("coingecko: http error -> empty, no throw", async () => {
    expect((await coingecko({ fetchFn: json({}, false) }).fetchLatest(["bitcoin"])).size).toBe(0);
  });
  it("eodhd: newest row wins", async () => {
    const f = json([{ date: "2026-10-23", close: 130.5 }, { date: "2026-10-22", close: 129 }]);
    expect((await eodhd({ apiKey: "K", fetchFn: f }).fetchLatest(["VWCE.XETRA"])).get("VWCE.XETRA")).toEqual({ date: "2026-10-23", close: 130.5 });
  });
  it("eodhd: failure never leaks the api key", async () => {
    const f = vi.fn(async () => { throw new Error("https://eodhd.com/api?api_token=SECRET"); });
    await expect(eodhd({ apiKey: "SECRET", fetchFn: f as unknown as typeof fetch }).fetchLatest(["X.US"])).resolves.toEqual(new Map());
  });
  it("eodhd search keeps ETFs/stocks and derives the Alpha Vantage symbol for Xetra", async () => {
    const f = json([
      { Code: "VWCE", Exchange: "XETRA", Name: "World ETF", Type: "ETF", Currency: "EUR", ISIN: "IE00TEST" },
      { Code: "XYZ", Exchange: "MI", Name: "Some Bond", Type: "Bond", Currency: "EUR" },
    ]);
    const c = await searchEodhd("IE00TEST", { apiKey: "K", fetchFn: f });
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ providerId: "VWCE.XETRA", altProvider: "alphavantage", altProviderId: "VWCE.DEX", kind: "etf" });
  });
  it("coingecko search maps coins", async () => {
    const c = await searchCoingecko("bit", { fetchFn: json({ coins: [{ id: "bitcoin", name: "Bitcoin", symbol: "btc" }] }) });
    expect(c[0]).toMatchObject({ provider: "coingecko", providerId: "bitcoin", symbol: "BTC", currency: "EUR" });
  });
  it("alphavantage: reads the latest close, stops on throttling", async () => {
    const ok = json({ "Time Series (Daily)": { "2026-10-22": { "4. close": "1" }, "2026-10-23": { "4. close": "2.5" } } });
    expect((await alphavantage({ apiKey: "K", fetchFn: ok }).fetchLatest(["A.DEX"])).get("A.DEX")).toEqual({ date: "2026-10-23", close: 2.5 });
    const throttled = json({ Information: "25 requests per day" });
    const p = alphavantage({ apiKey: "K", fetchFn: throttled });
    expect((await p.fetchLatest(["A.DEX", "B.DEX"])).size).toBe(0);
    expect(throttled).toHaveBeenCalledTimes(1);
  });
});

describe("runPriceUpdate", () => {
  const inst = (id: string, o: Partial<TrackedInstrument> = {}): TrackedInstrument => ({ id, kind: "etf", currency: "EUR", provider: "p1", providerId: id.toUpperCase(), lastDate: null, ...o });
  const fake = (name: string, limit: number, prices: Record<string, number>, batched = false): PriceProvider => ({
    name, dailyLimit: limit, batched,
    fetchLatest: vi.fn(async (ids: string[]) => new Map(ids.filter((i) => prices[i]).map((i) => [i, { date: "2026-10-23", close: prices[i] }]))),
  });
  const store = (tracked: TrackedInstrument[], used: Record<string, number> = {}) => {
    const rows: PriceRow[] = [];
    const calls: Record<string, number> = { ...used };
    const s: PriceStore = {
      trackedInstruments: async () => tracked,
      callsUsed: async (p) => calls[p] ?? 0,
      addCalls: async (p, _d, n) => { calls[p] = (calls[p] ?? 0) + n; },
      upsertPrices: async (r) => { rows.push(...r); },
    };
    return { s, rows, calls };
  };
  const WEEKDAY = "2026-10-23"; // Friday
  const SATURDAY = "2026-10-24";

  it("stores EUR prices and counts calls", async () => {
    const { s, rows, calls } = store([inst("a")]);
    const r = await runPriceUpdate({ providers: { p1: fake("p1", 20, { A: 10 }) }, store: s, today: WEEKDAY });
    expect(rows).toEqual([{ instrument_id: "a", date: "2026-10-23", close: 10, close_native: 10, currency_native: "EUR" }]);
    expect(calls.p1).toBe(1);
    expect(r).toMatchObject({ updated: 1, missing: 0 });
  });

  it("respects the daily budget and refreshes the stalest first", async () => {
    const tracked = [inst("fresh", { lastDate: "2026-10-22" }), inst("stale", { lastDate: "2026-10-01" }), inst("never")];
    const { s, rows } = store(tracked, { p1: 18 }); // 2 calls left
    const p = fake("p1", 20, { FRESH: 1, STALE: 2, NEVER: 3 });
    const r = await runPriceUpdate({ providers: { p1: p }, store: s, today: WEEKDAY });
    expect(rows.map((x) => x.instrument_id).sort()).toEqual(["never", "stale"]);
    expect(r.missing).toBe(1);
  });

  it("falls back to the alt provider when the primary fails", async () => {
    const { s, rows } = store([inst("a", { altProvider: "p2", altProviderId: "A.ALT" })]);
    const r = await runPriceUpdate({ providers: { p1: fake("p1", 20, {}), p2: fake("p2", 25, { "A.ALT": 7 }) }, store: s, today: WEEKDAY });
    expect(rows[0]).toMatchObject({ instrument_id: "a", close: 7 });
    expect(r.providers.p2.ok).toBe(1);
  });

  it("skips providers without a key and keeps going", async () => {
    const { s, rows } = store([inst("a", { provider: "nokey" }), inst("b")]);
    await runPriceUpdate({ providers: { p1: fake("p1", 20, { B: 5 }) }, store: s, today: WEEKDAY });
    expect(rows.map((x) => x.instrument_id)).toEqual(["b"]);
  });

  it("weekend: only crypto, one batched call", async () => {
    const tracked = [inst("etf1"), inst("btc", { kind: "crypto", provider: "cg", providerId: "bitcoin" })];
    const { s, rows, calls } = store(tracked);
    await runPriceUpdate({ providers: { p1: fake("p1", 20, { ETF1: 1 }), cg: fake("cg", 300, { bitcoin: 60000 }, true) }, store: s, today: SATURDAY });
    expect(rows.map((x) => x.instrument_id)).toEqual(["btc"]);
    expect(calls.p1).toBeUndefined();
    expect(calls.cg).toBe(1);
  });

  it("converts non-EUR quotes with the ECB rate; no rate -> skipped, not stored", async () => {
    const usd = inst("u", { currency: "USD", providerId: "U" });
    const a = store([usd]);
    await runPriceUpdate({ providers: { p1: fake("p1", 20, { U: 12 }) }, store: a.s, today: WEEKDAY, fx: async () => ({ date: WEEKDAY, rates: { USD: 1.2 } }) });
    expect(a.rows[0]).toMatchObject({ close: 10, close_native: 12, currency_native: "USD" });

    const b = store([usd]);
    const r = await runPriceUpdate({ providers: { p1: fake("p1", 20, { U: 12 }) }, store: b.s, today: WEEKDAY, fx: async () => { throw new Error("down"); } });
    expect(b.rows).toHaveLength(0);
    expect(r.missing).toBe(1);
  });

  it("is idempotent in shape: running twice writes the same (instrument, date) key", async () => {
    const { s, rows } = store([inst("a")]);
    const deps = { providers: { p1: fake("p1", 20, { A: 10 }) }, store: s, today: WEEKDAY };
    await runPriceUpdate(deps);
    await runPriceUpdate(deps);
    expect(new Set(rows.map((r) => `${r.instrument_id}|${r.date}`)).size).toBe(1);
  });
});
