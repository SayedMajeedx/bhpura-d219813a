import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

// These tests must never reach a real database: any network call fails loudly.
vi.stubGlobal("fetch", () => {
  throw new Error("Network access is blocked in catalog mutation tests");
});

type Request = {
  table: string;
  op: "select" | "insert" | "update" | "delete" | "rpc";
  payload?: unknown;
  select?: string;
  filters: Array<[string, ...unknown[]]>;
};
type Reply = { data?: unknown; error: unknown; count?: number | null };

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
      if (request.op === "select") request.select = columns;
      return chain;
    },
    insert: write("insert"),
    update: write("update"),
    delete: write("delete"),
    eq: record("eq"),
    in: record("in"),
    is: record("is"),
    not: record("not"),
    order: record("order"),
    single: () => chain,
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

const catalog = await import("../src/lib/data/catalog");

const filters = (request: Request, kind: string) =>
  request.filters.filter(([k]) => k === kind).map(([, ...rest]) => rest);
const denied = { message: "denied" };

beforeEach(() => {
  requests.length = 0;
  respond = () => ({ data: [], error: null });
});

describe("product writes", () => {
  it("create a product in the brand passed, whatever the values say, and return its id", async () => {
    respond = () => ({ data: { id: "p9" }, error: null });
    const id = await catalog.createProduct("b1", { name: "Abaya", brand_id: "other" });
    expect(id).toBe("p9");
    expect(requests[0]).toMatchObject({
      table: "products",
      op: "insert",
      payload: { name: "Abaya", brand_id: "b1" },
    });
  });

  it("scope single and bulk updates and deletes by brand", async () => {
    await catalog.updateProduct("b1", "p1", { is_active: true });
    await catalog.updateProducts("b1", ["p1", "p2"], { category: null });
    await catalog.deleteProducts("b1", ["p3"]);
    expect(requests.map((r) => [r.op, r.payload])).toEqual([
      ["update", { is_active: true }],
      ["update", { category: null }],
      ["delete", undefined],
    ]);
    expect(filters(requests[0], "eq")).toEqual([
      ["id", "p1"],
      ["brand_id", "b1"],
    ]);
    expect(filters(requests[1], "eq")).toEqual([["brand_id", "b1"]]);
    expect(filters(requests[1], "in")).toEqual([["id", ["p1", "p2"]]]);
    expect(filters(requests[2], "eq")).toEqual([["brand_id", "b1"]]);
    expect(filters(requests[2], "in")).toEqual([["id", ["p3"]]]);
  });

  it("throw the Supabase error so screens can show its message", async () => {
    respond = () => ({ error: denied });
    await expect(catalog.updateProduct("b1", "p1", { is_active: true })).rejects.toBe(denied);
    await expect(catalog.deleteProducts("b1", ["p1"])).rejects.toBe(denied);
    await expect(catalog.createProduct("b1", { name: "x" })).rejects.toBe(denied);
  });
});

describe("variant writes", () => {
  it("put every new variant in the brand passed", async () => {
    await catalog.createVariants("b1", [
      { product_id: "p1", brand_id: "other" },
      { product_id: "p1", brand_id: "b1" },
    ]);
    expect(requests[0].payload).toEqual([
      { product_id: "p1", brand_id: "b1" },
      { product_id: "p1", brand_id: "b1" },
    ]);
  });

  it("scope updates and deletes by brand", async () => {
    await catalog.updateVariant("b1", "v1", { selling_price: 5 });
    await catalog.updateVariants("b1", ["v1", "v2"], { selling_price: 7 });
    await catalog.deleteVariants("b1", ["v3"]);
    expect(filters(requests[0], "eq")).toEqual([
      ["id", "v1"],
      ["brand_id", "b1"],
    ]);
    for (const request of requests.slice(1)) {
      expect(request.table).toBe("product_variants");
      expect(filters(request, "eq")).toEqual([["brand_id", "b1"]]);
    }
    expect(filters(requests[2], "in")).toEqual([["id", ["v3"]]]);
  });

  it("make a product's variants follow its cost and regular price, keeping sale prices", async () => {
    await catalog.syncVariantsWithProduct("b1", "p1", { cost_price: 4, base_price: 20 });
    expect(requests.map((r) => r.payload)).toEqual([
      { cost_price: 4 },
      { selling_price: 20, original_price: null },
      { original_price: 20 },
    ]);
    for (const request of requests) {
      expect(filters(request, "eq")).toEqual([
        ["product_id", "p1"],
        ["brand_id", "b1"],
      ]);
    }
    expect(filters(requests[1], "is")).toEqual([["original_price", null]]);
    expect(filters(requests[2], "not")).toEqual([["original_price", "is", null]]);
  });

  it("stop following the product at the first failing step", async () => {
    respond = (request) =>
      (request.payload as { selling_price?: number }).selling_price === 20
        ? { error: denied }
        : { error: null };
    await expect(
      catalog.syncVariantsWithProduct("b1", "p1", { cost_price: 4, base_price: 20 }),
    ).rejects.toBe(denied);
    expect(requests).toHaveLength(2);
  });

  it("change stock through the ledger function as a manual adjustment", async () => {
    await catalog.adjustVariantStock({
      variantId: "v1",
      location: "incubator",
      mode: "delta",
      value: 3,
      note: "Bulk add stock +3",
    });
    expect(requests[0]).toMatchObject({
      table: "rpc_adjust_variant_stock",
      op: "rpc",
      payload: {
        p_variant_id: "v1",
        p_location: "incubator",
        p_mode: "delta",
        p_value: 3,
        p_reason: "manual_adjustment",
        p_note: "Bulk add stock +3",
      },
    });
    respond = () => ({ error: denied });
    await expect(
      catalog.adjustVariantStock({
        variantId: "v1",
        location: "main",
        mode: "set",
        value: 0,
        note: "x",
      }),
    ).rejects.toBe(denied);
  });
});

describe("packaging materials", () => {
  it("are created, changed and deleted within the brand", async () => {
    await catalog.createPackagingMaterial("b1", { name: "Box", brand_id: "other" });
    await catalog.updatePackagingMaterial("b1", "m1", { unit_cost: 0.25 });
    await catalog.deletePackagingMaterial("b1", "m1");
    expect(requests[0].payload).toEqual({ name: "Box", brand_id: "b1" });
    for (const request of requests.slice(1)) {
      expect(request.table).toBe("packaging_materials");
      expect(filters(request, "eq")).toEqual([
        ["id", "m1"],
        ["brand_id", "b1"],
      ]);
    }
  });
});

describe("packaging BOM", () => {
  const lines = [{ packaging_material_id: "m1", quantity_per_unit: 2 }];

  it("saves a product's direct cost, then replaces its lines", async () => {
    await catalog.saveProductBom("b1", "p1", 0.5, lines);
    expect(requests.map((r) => [r.table, r.op])).toEqual([
      ["products", "update"],
      ["product_bom_items", "delete"],
      ["product_bom_items", "insert"],
    ]);
    expect(requests[0].payload).toEqual({ direct_packaging_cost: 0.5 });
    expect(filters(requests[1], "eq")).toEqual([
      ["product_id", "p1"],
      ["brand_id", "b1"],
    ]);
    expect(requests[2].payload).toEqual([
      { packaging_material_id: "m1", quantity_per_unit: 2, brand_id: "b1", product_id: "p1" },
    ]);
  });

  it("inserts nothing for an empty BOM and never inserts after a failed delete", async () => {
    await catalog.saveProductBom("b1", "p1", 0, []);
    expect(requests.map((r) => r.op)).toEqual(["update", "delete"]);

    requests.length = 0;
    respond = (request) => (request.op === "delete" ? { error: denied } : { error: null });
    await expect(catalog.saveProductBom("b1", "p1", 0, lines)).rejects.toBe(denied);
    expect(requests.map((r) => r.op)).toEqual(["update", "delete"]);
  });

  it("applies one BOM to every product of the brand", async () => {
    respond = (request) =>
      request.op === "select"
        ? { data: [{ id: "p1" }, { id: "p2" }], error: null }
        : { error: null };
    expect(await catalog.applyBomToAllProducts("b1", 0.1, lines)).toBe(2);
    expect(requests.map((r) => [r.table, r.op])).toEqual([
      ["products", "select"],
      ["products", "update"],
      ["product_bom_items", "delete"],
      ["product_bom_items", "insert"],
    ]);
    for (const request of requests.slice(0, 3)) {
      expect(filters(request, "eq")).toEqual([["brand_id", "b1"]]);
    }
    expect(requests[3].payload).toEqual([
      { brand_id: "b1", product_id: "p1", packaging_material_id: "m1", quantity_per_unit: 2 },
      { brand_id: "b1", product_id: "p2", packaging_material_id: "m1", quantity_per_unit: 2 },
    ]);
  });

  it("writes nothing when the brand has no products", async () => {
    respond = () => ({ data: [], error: null });
    expect(await catalog.applyBomToAllProducts("b1", 0.1, lines)).toBe(0);
    expect(requests).toHaveLength(1);
  });

  it("keeps ignoring cost-update and delete errors when applying to all (bug backlog #16)", async () => {
    respond = (request) =>
      request.op === "select"
        ? { data: [{ id: "p1" }], error: null }
        : request.op === "insert"
          ? { error: null }
          : { error: denied };
    expect(await catalog.applyBomToAllProducts("b1", 0.1, lines)).toBe(1);
    expect(requests.map((r) => r.op)).toContain("insert");
  });
});

describe("catalog reads used by the inventory screens", () => {
  it("count one product's variants within the brand and throw on error", async () => {
    respond = () => ({ count: 3, error: null });
    expect(await catalog.countProductVariants("b1", "p1")).toBe(3);
    expect(filters(requests[0], "eq")).toEqual([
      ["product_id", "p1"],
      ["brand_id", "b1"],
    ]);
    respond = () => ({ count: null, error: denied });
    await expect(catalog.countProductVariants("b1", "p1")).rejects.toBe(denied);
  });

  it("read a failed product count as zero, so the plan limit never blocks by mistake", async () => {
    respond = () => ({ count: null, error: denied });
    expect(await catalog.countAdminProducts("b1")).toBe(0);
  });

  it("read barcode label data per brand and throw the products error first", async () => {
    respond = (request) =>
      request.table === "products"
        ? { data: [{ id: "p1", name: "A" }], error: null }
        : { data: [{ product_id: "p1", barcode: "123" }], error: null };
    const data = await catalog.fetchBarcodeLabelData("b1");
    expect(data.products).toEqual([{ id: "p1", name: "A" }]);
    expect(data.variants).toEqual([{ product_id: "p1", barcode: "123" }]);
    expect(filters(requests[1], "not")).toEqual([["barcode", "is", null]]);

    const productsError = { message: "products" };
    respond = (request) =>
      request.table === "products"
        ? { data: null, error: productsError }
        : { data: null, error: { message: "variants" } };
    await expect(catalog.fetchBarcodeLabelData("b1")).rejects.toBe(productsError);
  });
});

describe("invalidateCatalog", () => {
  it("refreshes the brand's product and variant lists only", async () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    await catalog.invalidateCatalog(qc, "b1");
    expect(spy.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      catalog.catalogKeys.products("b1"),
      catalog.catalogKeys.variants("b1"),
    ]);
  });
});

describe("customization options (paid add-ons)", () => {
  it("are read per brand by name under the key the inventory tab and order editor share", async () => {
    await catalog.fetchCustomizations("b1");
    expect(requests[0]).toMatchObject({ table: "customization_options", select: "*" });
    expect(filters(requests[0], "eq")).toEqual([["brand_id", "b1"]]);
    expect(filters(requests[0], "order")).toEqual([["name"]]);
    expect(catalog.catalogQueries.customizations("b1").queryKey).toEqual(["customizations", "b1"]);
    expect(catalog.catalogQueries.customizations("").enabled).toBe(false);
    respond = () => ({ data: null, error: denied });
    await expect(catalog.fetchCustomizations("b1")).rejects.toBe(denied);
  });

  it("are created in the brand passed and changed or deleted only within it", async () => {
    await catalog.createCustomization("b1", {
      user_id: "u1",
      name: "Gift wrap",
      price_delta: 1.5,
      product_ids: [],
    });
    await catalog.updateCustomization("b1", "c1", { product_ids: ["p1"] });
    await catalog.deleteCustomization("b1", "c1");
    expect(requests.map((r) => [r.table, r.op])).toEqual([
      ["customization_options", "insert"],
      ["customization_options", "update"],
      ["customization_options", "delete"],
    ]);
    expect(requests[0].payload).toMatchObject({ name: "Gift wrap", brand_id: "b1" });
    for (const request of requests.slice(1)) {
      expect(filters(request, "eq")).toEqual([
        ["id", "c1"],
        ["brand_id", "b1"],
      ]);
    }
    respond = () => ({ error: denied });
    await expect(catalog.deleteCustomization("b1", "c1")).rejects.toBe(denied);
  });

  it("refresh only the brand's add-ons after a write", async () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    await catalog.invalidateCustomizations(qc, "b1");
    expect(spy.mock.calls.map(([f]) => f?.queryKey)).toEqual([["customizations", "b1"]]);
  });
});
