import { beforeEach, describe, expect, it, vi } from "vitest";

// These tests must never reach a real database: any network call fails loudly.
vi.stubGlobal("fetch", () => {
  throw new Error("Network access is blocked in catalog data-layer tests");
});

type Request = { table: string; select: string; filters: Array<[string, ...unknown[]]> };
type Reply = { data: unknown; error: unknown };

const requests: Request[] = [];
let respond: (request: Request) => Reply = () => ({ data: [], error: null });

function builder(table: string) {
  const request: Request = { table, select: "", filters: [] };
  requests.push(request);
  const record =
    (kind: string) =>
    (...args: unknown[]) => (request.filters.push([kind, ...args]), chain);
  const chain = {
    select(columns: string) {
      request.select = columns;
      return chain;
    },
    eq: record("eq"),
    order: record("order"),
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
const { queryKeys } = await import("../src/lib/query-keys");

const filters = (request: Request, kind: string) =>
  request.filters.filter(([k]) => k === kind).map(([, ...rest]) => rest);

beforeEach(() => {
  requests.length = 0;
  respond = () => ({ data: [], error: null });
});

describe("catalog keys", () => {
  it("give each list one key, the one existing invalidations already use", () => {
    expect(catalog.catalogKeys.products("b1")).toEqual(queryKeys.products.all("b1"));
    expect(catalog.catalogKeys.variants("b1")).toEqual(queryKeys.variants.all("b1"));
    const keys = [
      catalog.catalogQueries.products("b1").queryKey,
      catalog.catalogQueries.variants("b1").queryKey,
      catalog.catalogQueries.bomItems("b1").queryKey,
      catalog.catalogQueries.packagingMaterials("b1").queryKey,
      catalog.catalogQueries.productBom("b1", "p1").queryKey,
    ];
    expect(new Set(keys.map((k) => JSON.stringify(k))).size).toBe(keys.length);
    // A product's BOM sits under the brand-wide prefix the BOM editor invalidates.
    expect(catalog.catalogKeys.productBom("b1", "p1").slice(0, 2)).toEqual(
      catalog.catalogKeys.productBoms("b1"),
    );
  });
});

describe("one order per list (bug backlog #13)", () => {
  it("sorts products and packaging newest first and variants oldest first", async () => {
    await catalog.fetchAdminProducts("b1");
    await catalog.fetchAdminVariants("b1");
    await catalog.fetchPackagingMaterials("b1");
    expect(filters(requests[0], "order")).toEqual([["created_at", { ascending: false }]]);
    expect(filters(requests[1], "order")).toEqual([["created_at"]]);
    expect(filters(requests[2], "order")).toEqual([["created_at", { ascending: false }]]);
    for (const request of requests) expect(filters(request, "eq")).toEqual([["brand_id", "b1"]]);
  });
});

describe("products", () => {
  it("parse media and custom fields into lists, never null", async () => {
    respond = () => ({
      data: [
        { id: "p1", media: null, custom_fields: null },
        { id: "p2", media: [{ type: "image", url: "a.jpg" }], custom_fields: "oops" },
      ],
      error: null,
    });
    const products = await catalog.fetchAdminProducts("b1");
    expect(products.map((p) => [p.media, p.custom_fields])).toEqual([
      [[], []],
      [[{ type: "image", url: "a.jpg" }], []],
    ]);
  });
});

describe("BOM", () => {
  it("reads a failing BOM as none, so packaging costs count as zero", async () => {
    respond = () => ({ data: null, error: new Error("denied") });
    expect(await catalog.fetchBomItems("b1")).toEqual([]);
  });

  it("reads one product's BOM scoped by brand", async () => {
    await catalog.fetchProductBom("b1", "p1");
    expect(filters(requests[0], "eq")).toEqual([
      ["product_id", "p1"],
      ["brand_id", "b1"],
    ]);
  });
});
