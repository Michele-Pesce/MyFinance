import type { AssetClass } from "../types";
import type { Candidate } from "./types";

const ISIN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
// Preferred listings for a European ETF that trades on several exchanges (EODHD exchange codes): euro first, then these.
const EXCHANGE_RANK = ["XETRA", "MI", "PA", "AS", "LSE"];

export const isIsin = (s: string) => ISIN.test(s.trim().toUpperCase());

/** Classes that can follow a price feed. */
export const TRACKABLE: AssetClass[] = ["etf", "stock", "bond", "crypto"];

/**
 * Picks the one search result a CSV "tracker" cell means, or null when nothing matches exactly (the asset is then linked by hand).
 * Crypto: the coin whose symbol (or CoinGecko id) equals the cell; CoinGecko lists the biggest coin first.
 * ETF/stock: the listing with that ISIN, or that ticker; among several listings prefer EUR, then the exchanges in EXCHANGE_RANK.
 */
export function pickCandidate(tracker: string, cls: AssetClass, results: Candidate[]): Candidate | null {
  const q = tracker.trim().toUpperCase();
  if (!q) return null;
  if (cls === "crypto") return results.find((c) => c.symbol.toUpperCase() === q || c.providerId.toUpperCase() === q) ?? null;

  const pool = results.filter((c) => (isIsin(q) ? (c.isin ?? "").toUpperCase() === q : c.symbol.toUpperCase() === q));
  const rank = (c: Candidate) => EXCHANGE_RANK.indexOf(c.exchange ?? "") === -1 ? 99 : EXCHANGE_RANK.indexOf(c.exchange ?? "");
  return [...pool].sort((a, b) => Number(b.currency === "EUR") - Number(a.currency === "EUR") || rank(a) - rank(b))[0] ?? null;
}
