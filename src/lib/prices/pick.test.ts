import { describe, expect, it } from "vitest";
import { isIsin, pickCandidate } from "./pick";
import type { Candidate } from "./types";

const c = (o: Partial<Candidate>): Candidate => ({ kind: "etf", name: "n", symbol: "X", currency: "EUR", provider: "eodhd", providerId: "X.XETRA", ...o });

describe("pickCandidate", () => {
  const listings = [
    c({ symbol: "VWCE", exchange: "LSE", currency: "USD", isin: "IE00BK5BQT80", providerId: "VWCE.LSE" }),
    c({ symbol: "VWCE", exchange: "MI", isin: "IE00BK5BQT80", providerId: "VWCE.MI" }),
    c({ symbol: "VWCE", exchange: "XETRA", isin: "IE00BK5BQT80", providerId: "VWCE.XETRA" }),
    c({ symbol: "OTHR", exchange: "XETRA", isin: "IE0000000000", providerId: "OTHR.XETRA" }),
  ];
  it("recognises an ISIN", () => {
    expect(isIsin(" ie00bk5bqt80 ")).toBe(true);
    expect(isIsin("VWCE")).toBe(false);
  });
  it("ISIN: only that ISIN, EUR and Xetra first", () => expect(pickCandidate("ie00bk5bqt80", "etf", listings)?.providerId).toBe("VWCE.XETRA"));
  it("ticker: exact symbol match", () => expect(pickCandidate("vwce", "etf", listings)?.providerId).toBe("VWCE.XETRA"));
  it("falls to the next exchange when Xetra is missing, and to a non-EUR one only as a last resort", () => {
    expect(pickCandidate("VWCE", "etf", listings.filter((l) => l.exchange !== "XETRA"))?.providerId).toBe("VWCE.MI");
    expect(pickCandidate("VWCE", "etf", listings.filter((l) => l.exchange === "LSE"))?.providerId).toBe("VWCE.LSE");
  });
  it("no exact match -> null (never a guess)", () => {
    expect(pickCandidate("IE00ZZZZZZZ0", "etf", listings)).toBeNull();
    expect(pickCandidate("VW", "etf", listings)).toBeNull();
    expect(pickCandidate("", "etf", listings)).toBeNull();
  });
  it("crypto: symbol or id, first (biggest) coin wins", () => {
    const coins = [c({ kind: "crypto", symbol: "BTC", providerId: "bitcoin", provider: "coingecko" }), c({ kind: "crypto", symbol: "BTC", providerId: "other-btc", provider: "coingecko" }), c({ kind: "crypto", symbol: "BCH", providerId: "bitcoin-cash", provider: "coingecko" })];
    expect(pickCandidate("btc", "crypto", coins)?.providerId).toBe("bitcoin");
    expect(pickCandidate("bitcoin-cash", "crypto", coins)?.symbol).toBe("BCH");
    expect(pickCandidate("DOGE", "crypto", coins)).toBeNull();
  });
});
