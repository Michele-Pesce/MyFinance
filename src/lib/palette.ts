import type { AssetClass } from "./types";

export const PALETTE_KEYS = ["yellow", "brown", "blue", "purple", "green", "orange", "pink", "red", "gray", "default"] as const;

/** CSS colour for a palette key; the same in light and dark (variables are defined once in globals.css). */
export const colorVar = (key?: string | null) => `var(--c-${key && (PALETTE_KEYS as readonly string[]).includes(key) ? key : "default"})`;

export const CLASS_COLOR: Record<AssetClass, string> = {
  liquidity: "green", etf: "blue", bond: "purple", stock: "pink", crypto: "orange", other: "gray", receivable: "yellow",
};
