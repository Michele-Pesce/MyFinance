// Price provider contract (handoff section 6). Providers are swappable; one failing never blocks the others.

export type InstrumentKind = "etf" | "stock" | "crypto" | "fx";

export interface TrackedInstrument {
  id: string;
  kind: InstrumentKind;
  currency: string; // quote currency of the primary provider's symbol
  provider: string;
  providerId: string;
  altProvider?: string | null;
  altProviderId?: string | null;
  lastDate: string | null; // date of the newest stored price, used to refresh the stalest first
}

/** A close as the provider reports it. `currency` overrides the instrument's when the provider converts itself. */
export interface Quote {
  date: string; // YYYY-MM-DD of the close
  close: number;
  currency?: string;
}

export interface PriceProvider {
  name: string;
  /** Calls allowed per UTC day on the free plan. */
  dailyLimit: number;
  /** true: one call serves many ids (CoinGecko). false: one call per id. */
  batched: boolean;
  /** Returns quotes for the ids it could fetch. Missing ids = failed; never throws, never exposes the API key. */
  fetchLatest(providerIds: string[]): Promise<Map<string, Quote>>;
}

export interface PriceRow {
  instrument_id: string;
  date: string;
  close: number; // EUR
  close_native: number;
  currency_native: string;
}

export interface PriceStore {
  trackedInstruments(): Promise<TrackedInstrument[]>;
  callsUsed(provider: string, date: string): Promise<number>;
  addCalls(provider: string, date: string, n: number): Promise<void>;
  upsertPrices(rows: PriceRow[]): Promise<void>;
}

export interface Candidate {
  kind: InstrumentKind;
  name: string;
  symbol: string;
  isin?: string | null;
  exchange?: string | null;
  currency: string;
  provider: string;
  providerId: string;
  altProvider?: string | null;
  altProviderId?: string | null;
}

export type FetchLike = typeof fetch;
