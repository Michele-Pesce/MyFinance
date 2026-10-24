// Domain types shared by the calc layer and the UI. Field names mirror the DB columns (camelCase).
// Dates are ISO strings "YYYY-MM-DD": they compare correctly as plain strings.

export const ASSET_CLASSES = ["liquidity", "etf", "stock", "bond", "crypto", "other", "receivable"] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

export const TX_TYPES = ["income", "expense", "pac", "lump_sum"] as const;
export type TxType = (typeof TX_TYPES)[number];

export interface Asset {
  id: string;
  name: string;
  class: AssetClass;
  platform?: string | null; // free text
  color?: string | null; // palette key, e.g. "blue"
  groupLabel?: string | null; // merges rows in the allocation chart
  instrumentId?: string | null; // link to a tracked market price
  monthlyContribution: number; // planned PAC per month
  initialInvested: number; // cost basis before tracking started
  initialUnits: number;
  manualPrice?: number | null;
  manualValue: number;
  manualValueAt?: string | null; // when manualValue was last set
  archived?: boolean;
}

export interface Transaction {
  id: string;
  date: string;
  type: TxType;
  category?: string | null;
  description?: string | null;
  amount: number; // always > 0, the sign comes from `type`
  assetId?: string | null;
  units?: number | null;
  unitsEstimated?: boolean;
}

export interface Snapshot {
  id: string;
  date: string;
  netWorth: number;
  liquidity: number;
  invested: number;
  crypto: number;
  receivables: number;
  source: "manual" | "auto";
}

/** Latest known close per instrument id, already converted to the user's currency. */
export type PriceMap = Record<string, number>;
