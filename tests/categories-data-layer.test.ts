import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

// These tests must never reach a real database: any network call fails loudly.
vi.stubGlobal("fetch", () => {
  throw new Error("Network access is blocked in categories data-layer tests");
});

type Request = {
  table: string;
  op: "select" | "insert" | "update" | "rpc";
  payload?: unknown;
  select?: string;
  filters: Array<[string, ...unknown[]]>;
};
type Reply = { data?: unknown; error: unknown };

const requests: Request[] = [];
let respond: (request: Request) => Reply = () => ({ data: [], error: null });

function builder(table: string) {
  const request: Request = { table, op: "select", filters: [] };
  requests.push(request);
  const record =
    (kind: string) =>
    (...args: unknown[]) => (request.filters.push([kind, ...args]), chain);
  const write = (op: Request["op"]) => (payload?: unknown) => {
    request.op = op;
    request.payload = payload;
    return chain;
  };
  const chain = {
    select(columns: string) {
      request.select = columns;
      return chain;
    },
    insert: write("insert"),
    update: write("update"),
    eq: record("eq"),
    order: record("order"),
    then(resolve: (reply: Reply) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve(respond(request)).then(resolve, reject);
    },
  };
  return chain;
}

const client = {
  supabase: {
    from: (table: string) => builder(table),
    rpc: (fn: string, args: unknown) => {
      const request: Request = { table: fn, op: "rpc", payload: args, filters: [] };
      requests.push(request);
      return Promise.resolve(respond(request));
    },
  },
};
vi.mock("../src/integrations/supabase/client", () => client);
vi.mock("@/integrations/supabase/client", () => client);

const categories = await import("../src/lib/data/categories");
const { queryKeys } = await import("../src/lib/query-keys");

const filters = (request: Request, kind: string) =>
  request.filters.filter(([k]) => k === kind).map(([, ...rest]) => rest);
const denied = { message: "denied" };

beforeEach(() => {
  requests.length = 0;
  respond = () => ({ data: [], error: null });
});

describe("keys (bug backlog #1)", () => {
  it("give every shape its own key under the brand prefix", () => {
    const keys = [
      categories.categoriesQueries.list("b1").queryKey,
      categories.categoriesQueries.active("b1").queryKey,
      categories.categoriesQueries.overview("b1").queryKey,
      categories.categoriesQueries.exportRows("b1").queryKey,
    ];
    expect(new Set(keys.map((k) => JSON.stringify(k))).size).toBe(keys.length);
    for (const key of keys) expect(key.slice(0, 2)).toEqual(["categories", "b1"]);
    // The prefix no longer holds a list itself.
    for (const key of keys) expect(key).not.toEqual(categories.categoriesKeys.all("b1"));
  });

  it("keep query-keys pointing at the same factories", () => {
    expect(queryKeys.categories.all("b1")).toEqual(categories.categoriesKeys.all("b1"));
    expect(queryKeys.categories.overview("b1")).toEqual(categories.categoriesKeys.overview("b1"));
  });

  it("refresh every shape with one invalidation", async () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    await categories.invalidateCategories(qc, "b1");
    expect(spy.mock.calls.map(([f]) => f?.queryKey)).toEqual([["categories", "b1"]]);
  });
});

describe("reads", () => {
  it("list every category in menu order, and only active ones for pickers", async () => {
    await categories.fetchCategories("b1");
    await categories.fetchActiveCategories("b1");
    expect(filters(requests[0], "eq")).toEqual([["brand_id", "b1"]]);
    expect(filters(requests[1], "eq")).toEqual([
      ["brand_id", "b1"],
      ["is_active", true],
    ]);
    for (const request of requests) {
      expect(filters(request, "order")).toEqual([["sort_order", { ascending: true }]]);
    }
  });

  it("throw on error for both lists (the inventory filter shows none either way)", async () => {
    respond = () => ({ data: null, error: denied });
    await expect(categories.fetchCategories("b1")).rejects.toBe(denied);
    await expect(categories.fetchActiveCategories("b1")).rejects.toBe(denied);
  });

  it("use the server's counts when it has them", async () => {
    respond = (request) =>
      request.op === "rpc"
        ? { data: [{ id: "c1", product_count: 4 }], error: null }
        : { error: null };
    expect(await categories.fetchCategoriesOverview("b1")).toEqual([
      { id: "c1", product_count: 4 },
    ]);
    expect(requests).toHaveLength(1);
    expect(requests[0].payload).toEqual({ p_brand_id: "b1" });
  });

  it("work the counts out when the server returns nothing", async () => {
    respond = (request) => {
      if (request.op === "rpc") return { data: [], error: null };
      if (request.table === "categories")
        return {
          data: [
            { id: "c1", slug: "abayas", name_en: "Abayas" },
            { id: "c2", slug: "new", name_en: "New" },
            { id: "c3", slug: "sale", name_en: "Sale" },
          ],
          error: null,
        };
      return {
        data: [
          { id: "p1", category: "abayas", is_active: true, show_sale_badge: false },
          { id: "p2", category: "Abayas", is_active: false, show_sale_badge: false },
          { id: "p3", category: "c1", is_active: true, show_sale_badge: true },
        ],
        error: null,
      };
    };
    const rows = await categories.fetchCategoriesOverview("b1");
    expect(rows.map((r) => [r.id, r.product_count, r.total_product_count, r.is_smart])).toEqual([
      ["c1", 2, 3, false],
      ["c2", 2, 2, true],
      ["c3", 1, 1, true],
    ]);
  });
});

describe("writes", () => {
  it("create and update categories within the brand", async () => {
    await categories.createCategory("b1", { name_en: "Abayas", brand_id: "other" });
    await categories.updateCategory("b1", "c1", { is_active: false });
    expect(requests[0].payload).toEqual({ name_en: "Abayas", brand_id: "b1" });
    expect(filters(requests[1], "eq")).toEqual([
      ["id", "c1"],
      ["brand_id", "b1"],
    ]);
    respond = () => ({ error: denied });
    await expect(categories.updateCategory("b1", "c1", {})).rejects.toBe(denied);
  });

  it("write menu positions within the brand, ignoring errors as before (bug backlog #20)", async () => {
    respond = () => ({ error: denied });
    await categories.setCategorySortOrders("b1", [
      { id: "c1", sort_order: 2 },
      { id: "c2", sort_order: 1 },
    ]);
    expect(requests.map((r) => r.payload)).toEqual([{ sort_order: 2 }, { sort_order: 1 }]);
    expect(filters(requests[0], "eq")).toEqual([
      ["id", "c1"],
      ["brand_id", "b1"],
    ]);
  });

  it("report whether a delete removed or deactivated the category", async () => {
    respond = () => ({ data: { mode: "soft", linked_products: 3 }, error: null });
    expect(await categories.deleteCategory("c1")).toEqual({ mode: "soft", linkedProducts: 3 });
    expect(requests[0]).toMatchObject({ table: "delete_category", payload: { p_id: "c1" } });
    respond = () => ({ data: null, error: denied });
    await expect(categories.deleteCategory("c1")).rejects.toBe(denied);
  });
});
