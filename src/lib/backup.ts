// Full-account backup (JSON export) and its inverse. The same format restores an account.
import { z } from "zod";
import type { AppData } from "./data";
import { ASSET_CLASSES, TX_TYPES } from "./types";

const num = z.number().finite();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const backupSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  categories: z.array(z.object({ kind: z.enum(["expense", "income"]), name: z.string().min(1).max(100), sort: z.number().int() })).max(200),
  assets: z.array(z.object({
    id: z.string().max(100), name: z.string().min(1).max(100), class: z.enum(ASSET_CLASSES),
    platform: z.string().max(200).nullish(), color: z.string().max(20).nullish(), groupLabel: z.string().max(200).nullish(),
    monthlyContribution: num.min(0), initialInvested: num, initialUnits: num, manualPrice: num.nullish(), manualValue: num,
    manualValueAt: date.nullish(), archived: z.boolean().nullish(),
  })).max(500),
  transactions: z.array(z.object({
    date, type: z.enum(TX_TYPES), category: z.string().max(200).nullish(), description: z.string().max(500).nullish(),
    amount: num.positive(), assetId: z.string().max(100).nullish(), units: num.positive().nullish(), unitsEstimated: z.boolean().nullish(),
  })).max(20000),
  snapshots: z.array(z.object({ date, netWorth: num, liquidity: num, invested: num, crypto: num, receivables: num, source: z.enum(["manual", "auto"]) })).max(5000),
});
export type Backup = z.infer<typeof backupSchema>;

export function buildBackup(d: AppData, now = new Date()): Backup {
  return {
    version: 1,
    exportedAt: now.toISOString(),
    categories: d.categories.map(({ kind, name, sort }) => ({ kind, name, sort })),
    assets: d.assets.map((a) => ({
      id: a.id, name: a.name, class: a.class, platform: a.platform, color: a.color, groupLabel: a.groupLabel,
      monthlyContribution: a.monthlyContribution, initialInvested: a.initialInvested, initialUnits: a.initialUnits,
      manualPrice: a.manualPrice, manualValue: a.manualValue, manualValueAt: a.manualValueAt, archived: a.archived,
    })),
    transactions: d.transactions.map((t) => ({
      date: t.date, type: t.type, category: t.category, description: t.description, amount: t.amount, assetId: t.assetId, units: t.units, unitsEstimated: t.unitsEstimated,
    })),
    snapshots: d.snapshots.map(({ date, netWorth, liquidity, invested, crypto, receivables, source }) => ({ date, netWorth, liquidity, invested, crypto, receivables, source })),
  };
}

/**
 * Backup -> DB rows for one user. Asset ids are regenerated (never trusted from the file), and transactions are re-pointed to
 * the new ids. Instrument links are not part of the backup: link prices again after a restore.
 */
export function backupToRows(b: Backup, userId: string, newId: () => string) {
  const idMap = new Map(b.assets.map((a) => [a.id, newId()]));
  return {
    categories: b.categories.map((c) => ({ user_id: userId, kind: c.kind, name: c.name, sort: c.sort })),
    assets: b.assets.map((a) => ({
      id: idMap.get(a.id)!, user_id: userId, name: a.name, class: a.class, platform: a.platform ?? null, color: a.color ?? null, group_label: a.groupLabel ?? null,
      monthly_contribution: a.monthlyContribution, initial_invested: a.initialInvested, initial_units: a.initialUnits, manual_price: a.manualPrice ?? null,
      manual_value: a.manualValue, manual_value_at: a.manualValueAt ?? null, archived: a.archived ?? false,
    })),
    transactions: b.transactions.map((t) => {
      const invest = t.type === "pac" || t.type === "lump_sum";
      return {
        user_id: userId, date: t.date, type: t.type, category: t.category ?? null, description: t.description ?? null, amount: t.amount,
        asset_id: t.assetId ? idMap.get(t.assetId) ?? null : null, units: invest ? t.units ?? null : null, units_estimated: t.unitsEstimated ?? false,
      };
    }),
    snapshots: b.snapshots.map((s) => ({ user_id: userId, date: s.date, net_worth: s.netWorth, liquidity: s.liquidity, invested: s.invested, crypto: s.crypto, receivables: s.receivables, source: s.source })),
  };
}
