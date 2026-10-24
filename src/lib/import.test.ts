import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";
import { ASSET_CSV_HEADER, TX_CSV_HEADER, buildRows, detectKind, guessMapping, isExactTxHeader, normalizeDate, normalizeType, parseAssetsCsv, parseCsv } from "./import";

describe("parseCsv", () => {
  it("detects ';', handles quotes, BOM and CRLF", () => {
    expect(parseCsv('﻿a;b\r\n"x;1";"say ""hi"""\r\n')).toEqual([["a", "b"], ["x;1", 'say "hi"']]);
  });
  it("detects ',' and skips blank lines", () => {
    expect(parseCsv("a,b\n\n1,2\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("round-trips our own export", () => {
    const csv = toCsv(["date", "amount"], [["2026-01-01", 12.5], ["2026-01-02", -3]]);
    expect(parseCsv(csv)).toEqual([["date", "amount"], ["2026-01-01", "12,5"], ["2026-01-02", "-3"]]);
  });
});

describe("normalizeDate / normalizeType", () => {
  it.each([["2026-03-07", "2026-03-07"], ["07/03/2026", "2026-03-07"], ["7-3-26", "2026-03-07"], ["07.03.2026", "2026-03-07"]])("%s", (i, o) => expect(normalizeDate(i)).toBe(o));
  it.each(["31/02/2026", "nope", ""])("rejects %s", (i) => expect(normalizeDate(i)).toBeNull());
  it("maps Italian and English types", () => {
    expect(normalizeType("Entrata")).toBe("income");
    expect(normalizeType("Investimento PAC")).toBe("pac");
    expect(normalizeType("lump_sum")).toBe("lump_sum");
    expect(normalizeType("boh")).toBeNull();
  });
});

describe("buildRows", () => {
  const map = guessMapping(["Data", "Importo", "Descrizione"]);
  it("without a type column the sign decides, amounts become positive", () => {
    const { valid, errors } = buildRows([["01/02/2026", "-12,50", "bar"], ["02/02/2026", "1.000,00", "stipendio"], ["xx", "1", ""], ["03/02/2026", "0", ""]], map);
    expect(valid.map((v) => [v.type, v.amount])).toEqual([["expense", 12.5], ["income", 1000]]);
    expect(errors).toEqual([{ line: 4, reason: "date" }, { line: 5, reason: "amount" }]);
  });
  it("uses the type column and keeps the asset only for investments", () => {
    const m = guessMapping(["date", "type", "amount", "asset", "units"]);
    const { valid } = buildRows([["2026-01-01", "pac", "100", "ETF A", "2,5"], ["2026-01-01", "expense", "5", "ETF A", ""]], m);
    expect(valid[0]).toMatchObject({ type: "pac", assetName: "ETF A", units: 2.5 });
    expect(valid[1].assetName).toBeNull();
  });
  it("unknown type is an error", () => {
    const m = guessMapping(["date", "type", "amount"]);
    expect(buildRows([["2026-01-01", "boh", "5"]], m).errors).toEqual([{ line: 2, reason: "type" }]);
  });
});

describe("assets CSV round trip (same format as the export)", () => {
  const exportCsv = toCsv([...ASSET_CSV_HEADER], [
    ["ETF A", "etf", "Broker", "blue", "", 100, 500.5, 5, 120.25, 0, "2026-01-05", "false"],
    ["Conto", "liquidity", null, "green", null, 0, 0, 0, null, 1234.56, null, "true"],
  ]);
  it("detects the kind", () => {
    expect(detectKind(parseCsv(exportCsv)[0])).toBe("assets");
    expect(detectKind(["Data", "Importo"])).toBe("transactions");
  });
  it("reads back every field", () => {
    const { valid, errors } = parseAssetsCsv(parseCsv(exportCsv));
    expect(errors).toEqual([]);
    expect(valid[0]).toMatchObject({ name: "ETF A", class: "etf", monthlyContribution: 100, initialInvested: 500.5, initialUnits: 5, manualPrice: 120.25, manualValueAt: "2026-01-05", archived: false });
    expect(valid[1]).toMatchObject({ name: "Conto", manualPrice: null, manualValue: 1234.56, manualValueAt: null, archived: true, platform: null });
  });
  it("flags bad rows", () => {
    const rows = parseCsv(toCsv([...ASSET_CSV_HEADER], [["", "etf", "", "", "", 0, 0, 0, "", 0, "", ""], ["X", "nope", "", "", "", 0, 0, 0, "", 0, "", ""], ["Y", "etf", "", "", "", "abc", 0, 0, "", 0, "", ""], ["Z", "etf", "", "", "", 0, 0, 0, "", 0, "31/02/2026", ""]]));
    expect(parseAssetsCsv(rows).errors.map((e) => e.reason)).toEqual(["name", "class", "number", "date"]);
  });
});

describe("transactions CSV round trip (same format as the export)", () => {
  it("our export header is recognised and rows come back identical", () => {
    const csv = toCsv([...TX_CSV_HEADER], [["2026-02-03", "pac", "", "PAC", 100, "ETF A", 0.8299], ["2026-02-04", "expense", "Cibo fuori", "pranzo", 12.5, "", null]]);
    const t = parseCsv(csv);
    expect(isExactTxHeader(t[0])).toBe(true);
    const { valid, errors } = buildRows(t.slice(1), guessMapping(t[0]));
    expect(errors).toEqual([]);
    expect(valid[0]).toMatchObject({ date: "2026-02-03", type: "pac", amount: 100, assetName: "ETF A", units: 0.8299 });
    expect(valid[1]).toMatchObject({ type: "expense", category: "Cibo fuori", description: "pranzo", amount: 12.5, assetName: null });
  });
});
