// Pure helpers that return the change to apply; the caller persists it.
import type { Asset } from "../types";
import type { AssetRow } from "./portfolio";

/** Updating the manual value always stamps manualValueAt, so later PACs are added on top of it. */
export function setManualValue(value: number, today: string): Pick<Asset, "manualValue" | "manualValueAt"> {
  return { manualValue: value, manualValueAt: today };
}

/** Units for a PAC logged without them: amount / price of the day. Caller stores unitsEstimated = true. */
export function estimateUnits(amount: number, price: number | null): number | null {
  return price !== null && price > 0 ? amount / price : null;
}

/**
 * "Incassato": the receivable's value moves into an explicitly chosen liquidity asset and the receivable is removed.
 * The target's *current* value is the base, so PACs logged after its manualValueAt are not lost.
 */
export function collectReceivable(
  receivable: AssetRow,
  target: AssetRow,
  today: string,
): { targetPatch: Pick<Asset, "manualValue" | "manualValueAt">; deleteId: string } {
  if (receivable.class !== "receivable") throw new Error("Asset is not a receivable");
  if (target.class !== "liquidity") throw new Error("Target must be a liquidity asset");
  return { targetPatch: setManualValue(target.value + receivable.value, today), deleteId: receivable.id };
}
