import { describe, expect, it } from "vitest";
import {
  productExportPresets,
  productImportFields,
  productListFilterOptions,
  productSampleCsv,
} from "../src/features/import-export/lib/store-columns";

// The last of the services-store audit (docs/vertical-fit-audit.md): import and export pages.

describe("the import and export pages", () => {
  it("map a stock column and offer stock filters and the valuation only where there is stock", () => {
    expect(productImportFields(true, false).map((f) => f.field)).toEqual([
      "name",
      "price",
      "stock",
      "sku",
      "image",
    ]);
    expect(productImportFields(false, false).map((f) => f.field)).toEqual([
      "name",
      "price",
      "sku",
      "image",
    ]);
    expect(productListFilterOptions(true).map((o) => o.value)).toEqual([
      "in_stock",
      "low_stock",
      "out_of_stock",
      "active_only",
      "draft_only",
    ]);
    expect(productListFilterOptions(false).map((o) => o.value)).toEqual([
      "active_only",
      "draft_only",
    ]);
    const presets = [{ id: "boutq_master" }, { id: "inventory_valuation" }];
    expect(productExportPresets(presets, true)).toHaveLength(2);
    expect(productExportPresets(presets, false).map((p) => p.id)).toEqual(["boutq_master"]);
  });

  it("give a store with no stock a sample file with no stock or cost column", () => {
    const header = (stock: boolean) => productSampleCsv(stock).split("\n")[0].split(",");
    expect(header(true)).toEqual(expect.arrayContaining(["stock", "cost_price", "sku"]));
    expect(header(false)).not.toEqual(expect.arrayContaining(["stock"]));
    expect(header(false)).not.toEqual(expect.arrayContaining(["cost_price"]));
    // every row has as many cells as the header (a quoted comma does not split a cell)
    for (const line of productSampleCsv(false).split("\n").slice(1)) {
      expect(line.replace(/"[^"]*"/g, "x").split(",")).toHaveLength(header(false).length);
    }
  });
});
