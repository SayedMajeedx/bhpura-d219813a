import { describe, expect, it, vi } from "vitest";

// The admin catalog reads costs from the staff-only tables and merges them into the rows, so the
// screens (inventory, orders, dashboard, imports) see the same shape as before.

type Result = { data: unknown; error: unknown };
const stubs = vi.hoisted(() => ({
  tables: {} as Record<string, Result>,
  selects: [] as string[][],
}));

// A query that can be chained and awaited, answering from `tables` by the table asked for.
function query(table: string) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "order", "returns", "not", "gt"]) {
    chain[method] = (...args: unknown[]) => {
      if (method === "select") stubs.selects.push([table, String(args[0])]);
      return chain;
    };
  }
  chain.then = (resolve: (value: Result) => unknown) =>
    resolve(stubs.tables[table] ?? { data: [], error: null });
  return chain;
}
const client = { supabase: { from: (table: string) => query(table) } };
vi.mock("../src/integrations/supabase/client", () => client);
vi.mock("@/integrations/supabase/client", () => client);

const catalog = await import("../src/lib/data/catalog");
const incubators = await import("../src/lib/data/incubators");

const set = (table: string, data: unknown, error: unknown = null) => {
  stubs.tables[table] = { data, error };
};
const reset = () => {
  stubs.tables = {};
  stubs.selects = [];
};

describe("the admin catalog with costs", () => {
  it("merges each product's costs into the product, and zero for one with no cost row", async () => {
    reset();
    set("products", [
      { id: "p1", media: [], custom_fields: [], name: "Abaya" },
      { id: "p2", media: null, custom_fields: null, name: "Scarf" },
    ]);
    set("product_costs", [
      { product_id: "p1", cost_price: "12.5", direct_packaging_cost: "0.75", vendor_id: "v9" },
    ]);
    const rows = await catalog.fetchAdminProducts("b1");
    expect(rows[0]).toMatchObject({
      id: "p1",
      cost_price: 12.5,
      direct_packaging_cost: 0.75,
      vendor_id: "v9",
    });
    expect(rows[1]).toMatchObject({
      id: "p2",
      cost_price: 0,
      direct_packaging_cost: 0,
      vendor_id: null,
    });
  });

  it("never asks the catalog tables for a cost column", async () => {
    reset();
    await catalog.fetchAdminProducts("b1");
    await catalog.fetchAdminVariants("b1");
    const asked = stubs.selects.filter(
      ([table]) => table === "products" || table === "product_variants",
    );
    expect(asked.length).toBe(2);
    for (const [, columns] of asked) {
      expect(columns).not.toContain("*");
      expect(columns).not.toMatch(/cost_price|direct_packaging_cost|vendor_id/);
    }
  });

  it("merges each variant's cost into the variant", async () => {
    reset();
    set("product_variants", [{ id: "v1" }, { id: "v2" }]);
    set("variant_costs", [{ variant_id: "v1", cost_price: 11 }]);
    expect(await catalog.fetchAdminVariants("b1")).toEqual([
      { id: "v1", cost_price: 11 },
      { id: "v2", cost_price: 0 },
    ]);
  });

  it("fails rather than showing zero costs when the cost read fails", async () => {
    reset();
    set("products", [{ id: "p1", media: [], custom_fields: [] }]);
    set("product_costs", null, { message: "permission denied" });
    await expect(catalog.fetchAdminProducts("b1")).rejects.toEqual({
      message: "permission denied",
    });
    set("product_variants", [{ id: "v1" }]);
    set("variant_costs", null, { message: "permission denied" });
    await expect(catalog.fetchAdminVariants("b1")).rejects.toEqual({
      message: "permission denied",
    });
  });

  it("adds the variant cost to each exported product's variants, and exports nothing if it cannot", async () => {
    reset();
    set("products", [{ id: "p1", product_variants: [{ id: "v1", sku: "A" }] }]);
    set("variant_costs", [{ variant_id: "v1", cost_price: 4 }]);
    expect(await catalog.fetchProductExportRows("b1")).toEqual([
      { id: "p1", product_variants: [{ id: "v1", sku: "A", cost_price: 4 }] },
    ]);
    const exported = stubs.selects.find(([table]) => table === "products");
    expect(exported?.[1]).not.toMatch(/cost_price/);

    vi.spyOn(console, "error").mockImplementation(() => undefined);
    set("variant_costs", null, { message: "denied" });
    expect(await catalog.fetchProductExportRows("b1")).toEqual([]);
  });

  it("adds the cost to the incubator batch-transfer variants", async () => {
    reset();
    set("product_variants", [{ id: "v1", sku: "A", incubator_inventory: [] }]);
    set("variant_costs", [{ variant_id: "v1", cost_price: 6 }]);
    expect(await incubators.fetchBatchTransferVariants("b1", ["p1"])).toEqual([
      { id: "v1", sku: "A", incubator_inventory: [], cost_price: 6 },
    ]);
    const asked = stubs.selects.find(([table]) => table === "product_variants");
    expect(asked?.[1]).not.toMatch(/cost_price/);
  });
});
