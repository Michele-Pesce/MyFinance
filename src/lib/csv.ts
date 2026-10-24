type Cell = string | number | null | undefined;

/** Neutralises spreadsheet formula injection: a text cell starting with = + - @ would otherwise execute in Excel. */
const safe = (s: string) => (/^[=+\-@\t\r]/.test(s) ? "'" + s : s);

export function toCsv(header: string[], rows: Cell[][]): string {
  const cell = (v: Cell) => {
    const s = typeof v === "number" ? String(v).replace(".", ",") : safe(String(v ?? ""));
    return '"' + s.replace(/"/g, '""') + '"';
  };
  return "﻿" + [header, ...rows].map((r) => r.map(cell).join(";")).join("\n");
}
