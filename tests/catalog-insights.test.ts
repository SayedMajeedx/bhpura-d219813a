import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

// These tests must never reach a real database: any network call fails loudly.
vi.stubGlobal("fetch", () => {
  throw new Error("Network access is blocked in catalog insight tests");
});

type Request = {
  table: string;
  select?: string;
  options?: unknown;
  filters: Array<[string, ...unknown[]]>;
};
type Reply = { data?: unknown; error: unknown; count?: number | null };

const requests: Request[] = [];
let respond: (request: Request) => Reply = () => ({ data: [], error: null });

function builder(table: string) {
  const request: Request = { table, filters: [] };
  requests.push(request);
  const record =
    (kind: string) =>
    (...args: unknown[]) => (request.filters.push([kind, ...args]), chain);
  const chain = {
    select(columns: string, options?: unknown) {
      request.select = columns;
      request.options = options;
      return chain;
    },
    eq: record("eq"),
    is: record("is"),
    or: record("or"),
    order: record("order"),
    limit: record("limit"),
    range: record("range"),
    then(resolve: (reply: Reply) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve(respond(request)).then(resolve, reject);
    },
  };
  return chain;
}

const client = { supabase: { from: (table: string) => builder(table) } };
vi.mock("../src/integrations/supabase/client", () => client);
vi.mock("@/integrations/supabase/client", () => client);

const catalog = await import("../src/lib/data/catalog");

const denied = { message: "denied" };
const eqs = (request: Request) =>
  request.filters.filter(([k]) => k === "eq").map(([, ...rest]) => rest);

beforeEach(() => {
  requests.length = 0;
  respond = () => ({ data: [], error: null });
});

describe("counts", () => {
  it("count shoppers still waiting for a restock, zero when unreadable", async () => {
    respond = () => ({ error: null, count: 4 });
    expect(await catalog.countPendingBackInStock("b1")).toBe(4);
    expect(requests[0]).toMatchObject({
      table: "back_in_stock_requests",
      options: { count: "exact", head: true },
    });
    expect(requests[0].filters).toContainEqual(["is", "notified_at", null]);
    respond = () => ({ error: denied, count: null });
    expect(await catalog.countPendingBackInStock("b1")).toBe(0);
  });

  it("count only active products for the readiness checklist", async () => {
    respond = () => ({ error: null, count: 12 });
    expect(await catalog.countActiveProducts("b1")).toBe(12);
    expect(eqs(requests[0])).toEqual([
      ["brand_id", "b1"],
      ["is_active", true],
    ]);
  });
});

describe("product search and pickers", () => {
  it("search six products by English or Arabic name within the brand", async () => {
    await catalog.searchProducts("b1", "abaya");
    expect(eqs(requests[0])).toEqual([["brand_id", "b1"]]);
    expect(requests[0].filters).toContainEqual([
      "or",
      "name_en.ilike.%abaya%,name_ar.ilike.%abaya%",
    ]);
    expect(requests[0].filters).toContainEqual(["limit", 6]);
    respond = () => ({ data: null, error: denied });
    expect(await catalog.searchProducts("b1", "abaya")).toEqual([]);
  });

  it("give the content studio the active products, and throw on error", async () => {
    await catalog.fetchContentStudioProducts("b1");
    expect(requests[0].filters).toContainEqual(["order", "updated_at", { ascending: false }]);
    respond = () => ({ data: null, error: denied });
    await expect(catalog.fetchContentStudioProducts("b1")).rejects.toBe(denied);
  });

  it("refresh with the product list", async () => {
    const qc = new QueryClient();
    for (const options of [
      catalog.catalogInsightQueries.backInStockCount("b1"),
      catalog.catalogInsightQueries.activeCount("b1"),
      catalog.catalogInsightQueries.contentStudio("b1"),
    ]) {
      qc.setQueryData(options.queryKey, 0);
    }
    await catalog.invalidateCatalog(qc, "b1");
    expect(
      qc
        .getQueryCache()
        .getAll()
        .every((query) => query.state.isInvalidated),
    ).toBe(true);
  });
});

describe("stock movements", () => {
  it("read one filtered page with its total", async () => {
    respond = () => ({ data: [{ id: "m1" }], error: null, count: 41 });
    const page = await catalog.fetchInventoryMovements({
      brandId: "b1",
      variantId: "v1",
      reason: "sale",
      location: "all",
      page: 2,
      pageSize: 20,
    });
    expect(page).toEqual({ rows: [{ id: "m1" }], count: 41 });
    expect(eqs(requests[0])).toEqual([
      ["brand_id", "b1"],
      ["variant_id", "v1"],
      ["reason", "sale"],
    ]);
    expect(requests[0].filters).toContainEqual(["range", 40, 59]);
    respond = () => ({ data: null, error: denied, count: null });
    await expect(
      catalog.fetchInventoryMovements({ brandId: "b1", page: 0, pageSize: 20 }),
    ).rejects.toBe(denied);
  });
});
