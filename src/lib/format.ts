// Italian number/date formatting and input parsing. Pure, locale fixed to it-IT for the MVP.

const LOCALE = "it-IT";

export function formatMoney(n: number, currency = "EUR"): string {
  return new Intl.NumberFormat(LOCALE, { style: "currency", currency }).format(Math.round((n || 0) * 100) / 100);
}

/** "+1.234,56 €" / "−1.234,56 €" (true minus sign). */
export function formatSigned(n: number, currency = "EUR"): string {
  return (n >= 0 ? "+" : "−") + formatMoney(Math.abs(n), currency);
}

export function formatPct(n: number, digits = 1): string {
  return (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(digits).replace(".", ",") + "%";
}

/** Compact axis label: 1,2k / 15k / 800. */
export function formatShort(n: number): string {
  const a = Math.abs(n);
  return a >= 1000 ? (n / 1000).toFixed(a >= 10000 ? 0 : 1).replace(".", ",") + "k" : String(Math.round(n));
}

/** "2026-03-07" -> "07/03/2026" */
export function formatDate(iso: string): string {
  return iso.split("-").reverse().join("/");
}

/** "2026-03" -> "marzo 2026" */
export function monthLong(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(LOCALE, { month: "long", year: "numeric" });
}

/** "2026-03" -> "mar 26" */
export function monthShort(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(LOCALE, { month: "short", year: "2-digit" }).replace(".", "");
}

export const todayIso = () => new Date().toLocaleDateString("sv-SE");

/**
 * Parses what a person types: "1.234,56", "12,5", "12.5", "12". Dots are thousands separators only when a comma is present.
 * Returns null for empty or non-numeric input, so callers can tell "0" from "nothing".
 */
export function parseDecimal(input: string | null | undefined): number | null {
  const s = (input ?? "").trim().replace(/\s/g, "");
  if (!s) return null;
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  if (!/^-?\d*\.?\d+$/.test(normalized) && !/^-?\d+\.$/.test(normalized)) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Number -> text for an input field, with a decimal comma and no trailing noise. */
export function toInput(n: number | null | undefined): string {
  return n == null || n === 0 ? "" : String(Math.round(n * 1e8) / 1e8).replace(".", ",");
}
