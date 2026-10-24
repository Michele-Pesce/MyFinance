import type { FetchLike } from "./types";

// ECB euro reference rates: units of currency per 1 EUR, published ~16:00 CET on working days.
export interface FxRates {
  date: string;
  rates: Record<string, number>;
}

const ECB_DAILY = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

export function parseEcbXml(xml: string): FxRates {
  const date = /<Cube time=['"](\d{4}-\d{2}-\d{2})['"]/.exec(xml)?.[1];
  if (!date) throw new Error("ecb: no date");
  const rates: Record<string, number> = {};
  for (const m of xml.matchAll(/<Cube currency=['"]([A-Z]{3})['"] rate=['"]([\d.]+)['"]/g)) rates[m[1]] = Number(m[2]);
  if (!Object.keys(rates).length) throw new Error("ecb: no rates");
  return { date, rates };
}

export async function fetchEcbRates(fetchFn: FetchLike = fetch): Promise<FxRates> {
  const res = await fetchFn(ECB_DAILY, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`ecb: http ${res.status}`);
  return parseEcbXml(await res.text());
}

/** Native amount -> EUR. Pence quotes (GBX / GBp, common on the LSE) are divided by 100 first. */
export function toEur(amount: number, currency: string, fx: FxRates | null): number {
  if (currency === "EUR") return amount;
  if (!fx) throw new Error("fx unavailable");
  const pence = currency === "GBX" || currency === "GBp";
  const code = pence ? "GBP" : currency;
  const rate = fx.rates[code];
  if (!rate) throw new Error(`no fx rate for ${code}`);
  return (pence ? amount / 100 : amount) / rate;
}
