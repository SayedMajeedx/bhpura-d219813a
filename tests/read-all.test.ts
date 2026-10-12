import { describe, expect, it, vi } from "vitest";
import { ListTooLongError, readAll } from "../src/lib/data/read-all";
import { findUnboundedListReads } from "../scripts/maintainability-metrics.mjs";

// A list is read to its end. The API answers with at most its row limit and does not say that it
// stopped, so a store's 1,001st variant, customer or order was simply not there.

type Row = { id: number };
const list = (length: number): Row[] => Array.from({ length }, (_, id) => ({ id }));

/** A server holding `total` rows that answers a range with at most `serverLimit` of them. */
function server(total: number, { serverLimit = 1000, counted = true } = {}) {
  const rows = list(total);
  const page = vi.fn(async (from: number, to: number) => {
    const data = rows.slice(from, Math.min(to + 1, from + serverLimit));
    return counted ? { data, error: null, count: total } : { data, error: null };
  });
  return { page, ids: (read: Row[]) => read.map((row) => row.id) };
}

describe("readAll", () => {
  it("reads a list that fits in one answer with one request", async () => {
    const { page } = server(33);
    expect(await readAll(page)).toHaveLength(33);
    expect(page).toHaveBeenCalledTimes(1);
    expect(page).toHaveBeenCalledWith(0, 999);
  });

  it("reads an empty list", async () => {
    const { page } = server(0);
    expect(await readAll(page)).toEqual([]);
    expect(page).toHaveBeenCalledTimes(1);
  });

  it("reads past the row limit: every row once, in order", async () => {
    const { page, ids } = server(2500);
    const rows = await readAll(page);
    expect(ids(rows)).toEqual(ids(list(2500)));
    // The first answer says how many there are; the rest is asked for at once.
    expect(page.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("stops at exactly the row limit without asking past the end", async () => {
    const { page } = server(1000);
    expect(await readAll(page)).toHaveLength(1000);
    expect(page).toHaveBeenCalledTimes(1);
  });

  it("follows the server's own limit when it is lower than a page", async () => {
    const { page, ids } = server(1300, { serverLimit: 500 });
    const rows = await readAll(page);
    expect(ids(rows)).toEqual(ids(list(1300)));
    expect(page.mock.calls).toEqual([
      [0, 999],
      [500, 999],
      [1000, 1499],
    ]);
  });

  it("without a count, takes a short page as the end and a full one as more to come", async () => {
    const short = server(40, { counted: false });
    expect(await readAll(short.page)).toHaveLength(40);
    expect(short.page).toHaveBeenCalledTimes(1);

    const long = server(2300, { counted: false });
    const rows = await readAll(long.page);
    expect(long.ids(rows)).toEqual(long.ids(list(2300)));
    expect(long.page).toHaveBeenCalledTimes(3);
  });

  it("throws the read's error, from the first page or a later one", async () => {
    const denied = { message: "permission denied" };
    await expect(readAll(async () => ({ data: null, error: denied }))).rejects.toBe(denied);

    const { page } = server(2500);
    page.mockImplementationOnce(async () => ({ data: list(1000), error: null, count: 2500 }));
    page.mockImplementationOnce(async () => ({ data: null, error: denied, count: null }));
    await expect(readAll(page)).rejects.toBe(denied);
  });

  it("takes a later page that fell past the end (rows removed meanwhile) as empty", async () => {
    const { page } = server(2500);
    page.mockImplementationOnce(async () => ({ data: list(1000), error: null, count: 2500 }));
    page.mockImplementationOnce(async () => ({ data: list(400), error: null, count: 1400 }));
    page.mockImplementationOnce(async () => ({
      data: null,
      error: { code: "PGRST103", message: "Requested range not satisfiable" },
      count: null,
    }));
    expect(await readAll(page)).toHaveLength(1400);
  });

  it("refuses a list no screen should hold, and never cuts it quietly", async () => {
    const { page } = server(1_000_000);
    await expect(readAll(page)).rejects.toBeInstanceOf(ListTooLongError);
    // Only the first page was asked for.
    expect(page).toHaveBeenCalledTimes(1);
  });
});

describe("the guard that finds a read with no bound", () => {
  const tables = (source: string) => findUnboundedListReads(source).map((read) => read.table);

  it("finds a list read that says nothing about how many rows it wants", () => {
    expect(
      tables(`
        const { data } = await supabase.from("customers").select("*").eq("brand_id", brandId);
      `),
    ).toEqual(["customers"]);
  });

  it("accepts a limit, a range, one row, a count, a list of ids and readAll's range", () => {
    expect(
      tables(`
        await supabase.from("orders").select("*").eq("brand_id", b).limit(20);
        await supabase.from("orders").select("*").eq("brand_id", b).maybeSingle();
        await supabase.from("orders").select("id", { count: "exact", head: true }).eq("brand_id", b);
        await supabase.from("orders").select("id").in("id", ids);
        await readAll((from, to) =>
          supabase.from("orders").select("*", { count: "exact" }).order("id").range(from, to),
        );
      `),
    ).toEqual([]);
  });

  it("accepts a query kept in a variable and given its range later", () => {
    expect(
      tables(`
        let query = supabase.from("orders").select(COLUMNS, { count: "exact" }).eq("brand_id", b);
        if (courier) query = query.eq("assigned_to", courier);
        return query.order("created_at").range(from, to);
      `),
    ).toEqual([]);
    expect(
      tables(`
        let query = supabase.from("orders").select(COLUMNS).eq("brand_id", b);
        const { data } = await query.order("created_at");
      `),
    ).toEqual(["orders"]);
  });

  it("does not take a write that returns its row for a list read", () => {
    expect(
      tables(`await supabase.from("orders").update(patch).eq("id", id).select("id");`),
    ).toEqual([]);
  });
});
