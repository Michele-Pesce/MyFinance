import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("uses ';', BOM and decimal comma", () => {
    expect(toCsv(["a", "b"], [["x", 1.5]])).toBe('﻿"a";"b"\n"x";"1,5"');
  });
  it("escapes quotes and neutralises formulas", () => {
    expect(toCsv(["a"], [['say "hi"'], ["=1+1"]])).toBe('﻿"a"\n"say ""hi"""\n"\'=1+1"');
  });
  it("empty cells stay empty", () => {
    expect(toCsv(["a"], [[null]])).toBe('﻿"a"\n""');
  });
});
