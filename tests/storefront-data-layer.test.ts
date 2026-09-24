import { beforeEach, describe, expect, it, vi } from "vitest";

// These tests must never reach a real database: any network call fails loudly.
vi.stubGlobal("fetch", () => {
  throw new Error("Network access is blocked in storefront data-layer tests");
});

/**
 * A minimal stand-in for the Supabase query builder: records each request and
 * answers it from `respond`, so fetchers are tested by behaviour, not source text.
 */
type Request = {
  table: string;
  select: string;
  filters: Array<[string, ...unknown[]]>;
  single: boolean;
};
type Reply = { data: unknown; error: unknown };

const requests: Request[] = [];
let respond: (request: Request) => Reply = () => ({ data: [], error: null });
let rpcReply: (fn: string, args: Record<string, unknown>) => Reply = () => ({
  data: [],
  error: null,
});

function builder(table: string) {
  const request: Request = { table, select: "", filters: [], single: false };
  requests.push(request);
  const chain = {
    select(columns: string) {
      request.select = columns;
      return chain;
    },
    eq: (...args: unknown[]) => (request.filters.push(["eq", ...args]), chain),
    in: (...args: unknown[]) => (request.filters.push(["in", ...args]), chain),
    or: (...args: unknown[]) => (request.filters.push(["or", ...args]), chain),
    gte: (...args: unknown[]) => (request.filters.push(["gte", ...args]), chain),
    order: (...args: unknown[]) => (request.filters.push(["order", ...args]), chain),
    limit: (...args: unknown[]) => (request.filters.push(["limit", ...args]), chain),
    maybeSingle() {
      request.single = true;
      return Promise.resolve(respond(request));
    },
    then(resolve: (reply: Reply) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve(respond(request)).then(resolve, reject);
    },
  };
  return chain;
}

// vi.mock is hoisted, so each factory is inline; `builder` and `rpcReply` are
// only read when a query runs. Both specifiers are mocked: the `@/` alias alone
// is not resolved by vi.mock in this setup.
vi.mock("../src/integrations/supabase/client", () => ({
  publicSupabase: {
    from: (table: string) => builder(table),
    rpc: (fn: string, args: Record<string, unknown>) => Promise.resolve(rpcReply(fn, args)),
  },
}));
vi.mock("@/integrations/supabase/client", () => ({
  publicSupabase: {
    from: (table: string) => builder(table),
    rpc: (fn: string, args: Record<string, unknown>) => Promise.resolve(rpcReply(fn, args)),
  },
}));

const {
  categoryScopeKey,
  fetchCategoryProducts,
  fetchProductDetail,
  fetchProductsByIds,
  sanitizeSearchTerm,
  storefrontKeys,
  storefrontQueries,
  PRODUCT_DETAIL_BASE_SELECT,
  PRODUCT_DETAIL_SELECT,
} = await import("../src/lib/data/storefront");

const brand = { id: "brand-1", slug: "pura" };
const filterValue = (request: Request, name: string, column: string) =>
  request.filters.find(([kind, col]) => kind === name && col === column)?.[2];

beforeEach(() => {
  requests.length = 0;
  respond = () => ({ data: [], error: null });
  rpcReply = () => ({ data: [], error: null });
});

describe("storefront query keys", () => {
  it("prefix every key with the store so an admin save can refresh the whole store", () => {
    const keys = [
      storefrontKeys.products("pura"),
      storefrontKeys.categories("pura"),
      storefrontKeys.product("pura", "p1"),
      storefrontKeys.bestSellers("pura", 8),
      storefrontKeys.customizationOptions("pura"),
    ];
    for (const key of keys) expect(key.slice(0, 2)).toEqual(["storefront", "pura"]);
  });

  it("give different queries different keys (no shared-key collisions)", () => {
    const options = [
      storefrontQueries.products(brand),
      storefrontQueries.product(brand, "p1"),
      storefrontQueries.recommendations(brand),
      storefrontQueries.productsByIds(brand, "wishlist", ["p1"]),
      storefrontQueries.productsByIds(brand, "recently-viewed", ["p1"]),
      storefrontQueries.categories(brand),
      storefrontQueries.category(brand, "abayas"),
      storefrontQueries.categoryProducts(brand, "abayas", {
        kind: "categories",
        values: ["abayas"],
      }),
      storefrontQueries.bestSellers(brand, 8),
      storefrontQueries.bestSellers(brand, 10),
      storefrontQueries.trending(brand, 8),
      storefrontQueries.search(brand, "abaya"),
      storefrontQueries.quickSearch(brand, "abaya", 8),
      storefrontQueries.quickSearch(brand, "abaya", 10),
      storefrontQueries.customizationOptions(brand),
    ];
    const serialized = options.map((o) => JSON.stringify(o.queryKey));
    expect(new Set(serialized).size).toBe(serialized.length);
  });

  it("key category collections by their values, independent of order", () => {
    expect(categoryScopeKey({ kind: "categories", values: ["b", "a"] })).toBe(
      categoryScopeKey({ kind: "categories", values: ["a", "b"] }),
    );
    expect(categoryScopeKey({ kind: "best" })).toBe("best");
  });
});

describe("product detail columns", () => {
  it("never asks for products.original_price (the column does not exist)", () => {
    for (const select of [PRODUCT_DETAIL_SELECT, PRODUCT_DETAIL_BASE_SELECT]) {
      const productColumns = select.slice(0, select.indexOf("product_variants("));
      expect(productColumns).not.toContain("original_price");
    }
  });

  it("includes the per-product option labels in the full list only", () => {
    expect(PRODUCT_DETAIL_SELECT).toContain("variant_label_color_ar");
    expect(PRODUCT_DETAIL_BASE_SELECT).not.toContain("variant_label_");
  });
});

describe("fetchProductDetail", () => {
  it("returns the product found by id, scoped to the brand and active products", async () => {
    respond = () => ({ data: { id: "p1" }, error: null });
    await expect(fetchProductDetail("brand-1", "p1")).resolves.toEqual({ id: "p1" });
    expect(filterValue(requests[0], "eq", "brand_id")).toBe("brand-1");
    expect(filterValue(requests[0], "eq", "is_active")).toBe(true);
  });

  it("falls back to the base columns when the full request fails", async () => {
    respond = (r) =>
      r.select === PRODUCT_DETAIL_SELECT
        ? { data: null, error: { message: "permission denied" } }
        : { data: { id: "p1" }, error: null };
    await expect(fetchProductDetail("brand-1", "p1")).resolves.toEqual({ id: "p1" });
    expect(requests.map((r) => r.select)).toEqual([
      PRODUCT_DETAIL_SELECT,
      PRODUCT_DETAIL_BASE_SELECT,
    ]);
  });

  it("tries a repaired id, then the name slug", async () => {
    respond = (r) => {
      const id = filterValue(r, "eq", "id");
      if (id === "fixed-id") return { data: { id: "fixed-id" }, error: null };
      return { data: null, error: null };
    };
    await expect(fetchProductDetail("brand-1", "broken", ["fixed-id"])).resolves.toEqual({
      id: "fixed-id",
    });

    requests.length = 0;
    respond = (r) =>
      r.filters.some(([kind]) => kind === "or")
        ? { data: { id: "by-name" }, error: null }
        : { data: null, error: null };
    await expect(fetchProductDetail("brand-1", "black-abaya")).resolves.toEqual({ id: "by-name" });
    const nameRequest = requests.find((r) => r.filters.some(([kind]) => kind === "or"));
    expect(nameRequest?.filters.find(([kind]) => kind === "or")?.[1]).toContain("black abaya");
  });
});

describe("fetchProductsByIds", () => {
  it("keeps the requested order and drops missing products", async () => {
    respond = () => ({ data: [{ id: "b" }, { id: "a" }], error: null });
    const rows = await fetchProductsByIds("brand-1", ["a", "missing", "b"]);
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("does not query when there are no ids", async () => {
    await expect(fetchProductsByIds("brand-1", [])).resolves.toEqual([]);
    expect(requests).toHaveLength(0);
  });
});

describe("fetchCategoryProducts", () => {
  it("lists best sellers in ranking order", async () => {
    rpcReply = () => ({
      data: [
        { product_id: "b", units_sold: 9 },
        { product_id: "a", units_sold: 3 },
      ],
      error: null,
    });
    respond = () => ({ data: [{ id: "a" }, { id: "b" }], error: null });
    const rows = await fetchCategoryProducts(brand, { kind: "best" });
    expect(rows.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("keeps only discounted products for offers", async () => {
    respond = () => ({
      data: [
        { id: "sale", product_variants: [{ selling_price: 8, original_price: 10 }] },
        { id: "full", product_variants: [{ selling_price: 10, original_price: null }] },
      ],
      error: null,
    });
    const rows = await fetchCategoryProducts(brand, { kind: "offers" });
    expect(rows.map((r) => r.id)).toEqual(["sale"]);
  });

  it("limits new arrivals to the last 30 days, newest first", async () => {
    const before = Date.now();
    await fetchCategoryProducts(brand, { kind: "new" });
    const since = Date.parse(String(filterValue(requests[0], "gte", "created_at")));
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    expect(Math.abs(before - thirtyDays - since)).toBeLessThan(5_000);
    expect(requests[0].filters).toContainEqual(["order", "created_at", { ascending: false }]);
    expect(requests[0].filters).toContainEqual(["limit", 60]);
  });

  it("filters a category collection by its values", async () => {
    await fetchCategoryProducts(brand, { kind: "categories", values: ["abayas", "Abayas"] });
    expect(filterValue(requests[0], "in", "category")).toEqual(["abayas", "Abayas"]);
  });
});

describe("sanitizeSearchTerm", () => {
  it("removes characters that break a PostgREST or-filter or act as wildcards", () => {
    expect(sanitizeSearchTerm(" black, abaya (new) 50%_off\\ ")).toBe("black  abaya  new  50  off");
  });
});
