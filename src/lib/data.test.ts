import { describe, expect, it } from "vitest";
import { PAGE_SIZE, fetchAll } from "./data";

// A fake table that behaves like PostgREST with max_rows = PAGE_SIZE: a range wider than the cap is cut silently.
const table = (n: number) => {
  const rows = Array.from({ length: n }, (_, i) => ({ id: i }));
  const calls: Array<[number, number]> = [];
  const build = async (from: number, to: number) => {
    calls.push([from, to]);
    return { data: rows.slice(from, Math.min(to, from + PAGE_SIZE - 1) + 1), error: null };
  };
  return { build, calls };
};

describe("fetchAll", () => {
  it("returns every row of a table larger than the server cap", async () => {
    const t = table(PAGE_SIZE * 2 + 37);
    const { data, error } = await fetchAll(t.build);
    expect(error).toBeNull();
    expect(data).toHaveLength(PAGE_SIZE * 2 + 37);
    expect(data.map((r) => r.id)).toEqual(Array.from({ length: PAGE_SIZE * 2 + 37 }, (_, i) => i));
  });

  it("stops after one call when the table is smaller than a page", async () => {
    const t = table(12);
    expect((await fetchAll(t.build)).data).toHaveLength(12);
    expect(t.calls).toHaveLength(1);
  });

  it("asks once more when the size is an exact multiple of a page, then stops on the empty page", async () => {
    const t = table(PAGE_SIZE);
    expect((await fetchAll(t.build)).data).toHaveLength(PAGE_SIZE);
    expect(t.calls).toHaveLength(2);
  });

  it("returns an empty list for an empty table", async () => {
    expect((await fetchAll(table(0).build)).data).toEqual([]);
  });

  it("reports the error of a failing page", async () => {
    let n = 0;
    const r = await fetchAll(async () => (++n === 2 ? { data: null, error: { message: "boom" } } : { data: Array.from({ length: PAGE_SIZE }, (_, i) => i), error: null }));
    expect(r.error?.message).toBe("boom");
  });
});
