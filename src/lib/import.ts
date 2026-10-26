// Pure parsing for the CSV import (preview + column mapping). No I/O.
import { parseDecimal } from "./format";
import { ASSET_CLASSES, type AssetClass, type TxType } from "./types";

/** Minimal RFC-4180 reader: quotes, "" escapes, CRLF, BOM. The delimiter (; , or tab) is detected on the first line. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const first = src.split(/\r?\n/, 1)[0] ?? "";
  const delim = [";", "\t", ","].map((d) => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

/** "2026-03-07", "07/03/2026", "7-3-2026", "07.03.26" -> ISO, or null when it is not a real date. */
export function normalizeDate(raw: string): string | null {
  const s = raw.trim();
  let y: number, m: number, d: number;
  let mt = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (mt) [y, m, d] = [+mt[1], +mt[2], +mt[3]];
  else if ((mt = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s))) [d, m, y] = [+mt[1], +mt[2], mt[3].length === 2 ? 2000 + +mt[3] : +mt[3]];
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

const TYPE_ALIASES: Record<string, TxType> = {
  income: "income", entrata: "income", entrate: "income",
  expense: "expense", spesa: "expense", uscita: "expense", spese: "expense",
  pac: "pac", "investimento pac": "pac",
  lump_sum: "lump_sum", pic: "lump_sum", "investimento pic": "lump_sum",
};
export const normalizeType = (raw: string): TxType | null => TYPE_ALIASES[raw.trim().toLowerCase()] ?? null;

export interface Mapping { date: number; amount: number; type: number; category: number; description: number; asset: number; units: number } // column index, -1 = none
export interface ImportRow { date: string; type: TxType; category: string | null; description: string | null; amount: number; assetName: string | null; units: number | null }
export interface ImportError { line: number; reason: "date" | "amount" | "type" }

/** Maps CSV rows (header already removed) through the column mapping. Without a type column the sign of the amount decides. */
export function buildRows(rows: string[][], map: Mapping): { valid: ImportRow[]; errors: ImportError[] } {
  const valid: ImportRow[] = [];
  const errors: ImportError[] = [];
  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
  rows.forEach((r, idx) => {
    const line = idx + 2; // +1 header, +1 human numbering
    const date = normalizeDate(cell(r, map.date));
    if (!date) return errors.push({ line, reason: "date" });
    const amount = parseDecimal(cell(r, map.amount));
    if (amount === null || amount === 0) return errors.push({ line, reason: "amount" });
    let type: TxType | null;
    if (map.type >= 0) type = normalizeType(cell(r, map.type));
    else type = amount < 0 ? "expense" : "income";
    if (!type) return errors.push({ line, reason: "type" });
    const units = parseDecimal(cell(r, map.units));
    valid.push({
      date, type, amount: Math.abs(amount), category: cell(r, map.category) || null, description: cell(r, map.description) || null,
      // investments: the asset; income/expense: the liquidity account the money moved on
      assetName: cell(r, map.asset) || null, units: units !== null && units > 0 ? units : null,
    });
  });
  return { valid, errors };
}

/** Header guess: pre-selects the column whose name looks like the field (English or Italian). */
export function guessMapping(header: string[]): Mapping {
  const find = (...names: string[]) => header.findIndex((h) => names.includes(h.trim().toLowerCase()));
  return {
    date: find("date", "data"), amount: find("amount", "importo"), type: find("type", "tipo"), category: find("category", "categoria"),
    description: find("description", "descrizione"), asset: find("asset"), units: find("units", "quote"),
  };
}

/* ------------------------- assets CSV (same format as the export) ------------------------- */

export const ASSET_CSV_HEADER = [
  "name", "class", "platform", "color", "group", "monthly_contribution", "initial_invested", "initial_units", "manual_price", "manual_value", "manual_value_at", "archived",
] as const;
export const TX_CSV_HEADER = ["date", "type", "category", "description", "amount", "asset", "units"] as const;

export type CsvKind = "assets" | "transactions";

/** Which of our two export formats a header looks like. Anything else is a bank-style file and goes through column mapping. */
export function detectKind(header: string[]): CsvKind {
  const h = header.map((x) => x.trim().toLowerCase());
  return h.includes("class") && h.includes("name") && h.includes("manual_value") ? "assets" : "transactions";
}

export const isExactTxHeader = (header: string[]) => TX_CSV_HEADER.every((c, i) => header[i]?.trim().toLowerCase() === c);

export interface AssetImportRow {
  name: string; class: AssetClass; platform: string | null; color: string | null; groupLabel: string | null;
  monthlyContribution: number; initialInvested: number; initialUnits: number; manualPrice: number | null; manualValue: number;
  manualValueAt: string | null; archived: boolean;
}
export interface AssetImportError { line: number; reason: "name" | "class" | "number" | "date" }

export function parseAssetsCsv(rows: string[][]): { valid: AssetImportRow[]; errors: AssetImportError[] } {
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (r: string[], name: string) => (r[header.indexOf(name)] ?? "").trim();
  const valid: AssetImportRow[] = [];
  const errors: AssetImportError[] = [];
  rows.slice(1).forEach((r, idx) => {
    const line = idx + 2;
    const name = col(r, "name");
    if (!name) return errors.push({ line, reason: "name" });
    const cls = col(r, "class").toLowerCase() as AssetClass;
    if (!(ASSET_CLASSES as readonly string[]).includes(cls)) return errors.push({ line, reason: "class" });
    const num = (field: string): number | null | "bad" => {
      const raw = col(r, field);
      if (!raw) return null;
      const n = parseDecimal(raw);
      return n === null ? "bad" : n;
    };
    const [mc, ii, iu, mp, mv] = ["monthly_contribution", "initial_invested", "initial_units", "manual_price", "manual_value"].map(num);
    if ([mc, ii, iu, mp, mv].includes("bad") || (mc as number | null) !== null && (mc as number) < 0) return errors.push({ line, reason: "number" });
    const rawAt = col(r, "manual_value_at");
    const at = rawAt ? normalizeDate(rawAt) : null;
    if (rawAt && !at) return errors.push({ line, reason: "date" });
    valid.push({
      name, class: cls, platform: col(r, "platform") || null, color: col(r, "color") || null, groupLabel: col(r, "group") || null,
      monthlyContribution: (mc as number | null) ?? 0, initialInvested: (ii as number | null) ?? 0, initialUnits: (iu as number | null) ?? 0,
      manualPrice: (mp as number | null) ?? null, manualValue: (mv as number | null) ?? 0, manualValueAt: at, archived: ["true", "1", "si", "sì"].includes(col(r, "archived").toLowerCase()),
    });
  });
  return { valid, errors };
}
