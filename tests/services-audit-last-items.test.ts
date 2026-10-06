import { describe, expect, it } from "vitest";
import {
  productExportPresets,
  productImportFields,
  productListFilterOptions,
  productSampleCsv,
} from "../src/features/import-export/lib/store-columns";
import { campaignTemplateIds, expenseHints } from "../apps/boutq-os-mobile/src/lib/store-copy";
import { resolveMobileModules } from "../apps/boutq-os-mobile/src/lib/store-modules";

// The last of the services-store audit (docs/vertical-fit-audit.md): import and export pages, and the
// merchant app's message presets and expense hints follow the store's modules.

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

describe("the merchant app's message presets and expense hints", () => {
  const modulesOf = (vertical: string, overrides?: unknown) =>
    resolveMobileModules(vertical, overrides);

  it("keep the courier message and the pickup message for a shop", () => {
    expect(campaignTemplateIds(modulesOf("fashion"))).toEqual([
      "confirm",
      "dispatch",
      "pickup",
      "promo",
    ]);
  });

  it("give a services store a reminder instead of a courier or a parcel pickup", () => {
    expect(campaignTemplateIds(modulesOf("services"))).toEqual(["confirm", "reminder", "promo"]);
  });

  it("follow a module the store turned on, not the vertical's name", () => {
    expect(campaignTemplateIds(modulesOf("services", { shipping: true }))).toContain("dispatch");
    expect(campaignTemplateIds(modulesOf("fashion", { shipping: false, stock: false }))).toEqual([
      "confirm",
      "promo",
    ]);
  });

  it("stop suggesting fabric and shipping to a store that keeps no goods", () => {
    const services = expenseHints(modulesOf("services"), false);
    expect(services.example).not.toMatch(/Fabric|Tailoring|shipping/i);
    expect(services.empty).not.toMatch(/fabric|delivery/i);
    expect(expenseHints(modulesOf("fashion"), true).example).toContain("شحن");
  });
});
