import { describe, expect, it } from "vitest";
import { formatDate, formatPct, formatSigned, parseDecimal, toInput } from "./format";

describe("parseDecimal", () => {
  it.each([
    ["1.234,56", 1234.56],
    ["12,5", 12.5],
    ["12.5", 12.5],
    ["12", 12],
    ["  7 ", 7],
    ["0,001", 0.001],
  ])("%s -> %d", (input, out) => expect(parseDecimal(input)).toBe(out));

  it.each(["", "  ", "abc", "1,2,3", "12e3", null, undefined])("%s -> null", (input) => expect(parseDecimal(input as string)).toBeNull());
});

describe("formatting", () => {
  it("formats dates dd/mm/yyyy", () => expect(formatDate("2026-03-07")).toBe("07/03/2026"));
  it("formats signed percentages with a comma", () => {
    expect(formatPct(12.34)).toBe("+12,3%");
    expect(formatPct(-0.5)).toBe("−0,5%");
  });
  it("formats signed money with a real minus", () => expect(formatSigned(-5)).toMatch(/^−5,00/));
  it("toInput round trips through parseDecimal", () => expect(parseDecimal(toInput(1234.5))).toBe(1234.5));
  it("toInput leaves zero empty", () => expect(toInput(0)).toBe(""));
});
