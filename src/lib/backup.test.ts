import { describe, expect, it } from "vitest";
import { backupSchema, backupToRows, buildBackup } from "./backup";
import type { AppData } from "./data";

const data: AppData = {
  assets: [{ id: "old-1", name: "A", class: "etf", monthlyContribution: 10, initialInvested: 0, initialUnits: 0, manualValue: 5, manualValueAt: "2026-01-01", instrumentId: "ins" }],
  transactions: [
    { id: "t1", date: "2026-01-02", type: "pac", amount: 10, assetId: "old-1", units: 1, unitsEstimated: true },
    { id: "t2", date: "2026-01-03", type: "expense", amount: 4, category: "x", assetId: null },
  ],
  snapshots: [], categories: [{ id: "c", kind: "expense", name: "x", sort: 1 }], prices: {}, priceDates: {}, instruments: {},
};

describe("backup", () => {
  it("export validates against its own schema (round trip through JSON)", () => {
    const parsed = backupSchema.parse(JSON.parse(JSON.stringify(buildBackup(data))));
    expect(parsed.assets).toHaveLength(1);
  });
  it("restore regenerates asset ids and re-points transactions; instrument links are dropped", () => {
    const rows = backupToRows(backupSchema.parse(buildBackup(data)), "user-9", () => "NEW");
    expect(rows.assets[0]).toMatchObject({ id: "NEW", user_id: "user-9" });
    expect(rows.assets[0]).not.toHaveProperty("instrument_id");
    expect(rows.transactions[0]).toMatchObject({ asset_id: "NEW", units: 1, units_estimated: true });
    expect(rows.transactions[1].asset_id).toBeNull();
  });
  it("rejects malformed files", () => {
    expect(backupSchema.safeParse({ version: 2 }).success).toBe(false);
    expect(backupSchema.safeParse({ ...buildBackup(data), transactions: [{ date: "x", type: "pac", amount: -1 }] }).success).toBe(false);
  });
});
