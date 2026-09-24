import { describe, expect, it } from "vitest";
import {
  batchSalePriceValue,
  buildBulkVariantRows,
  bulkRowPricing,
  hasInvalidBulkRows,
  parsedPlanMessage,
} from "../src/features/inventory/lib/bulk-variants";
import type { VariantGenerationPlan } from "../src/lib/generate-variants.functions";
import type { BulkVariantRow } from "../src/features/inventory/types";

const plan = (overrides: Partial<VariantGenerationPlan> = {}) =>
  ({
    base_sku: "abaya",
    sizes: [],
    colors: [],
    size_unit: "",
    fabric: "",
    stock_main: 5,
    stock_incubator: 0,
    cost_price: 0,
    selling_price: 0,
    size_stock_map: {},
    ...overrides,
  }) as unknown as VariantGenerationPlan;

let counter = 0;
const barcode = () => `B${++counter}`;

const build = (overrides: Partial<Parameters<typeof buildBulkVariantRows>[0]> = {}) =>
  buildBulkVariantRows({
    sizesText: "S, M",
    colorsText: "Black",
    plan: plan(),
    basePrice: 30,
    costPrice: 12,
    salePriceText: "",
    existingBarcodes: [],
    makeBarcode: barcode,
    ...overrides,
  });

describe("buildBulkVariantRows", () => {
  it("builds one row per size × colour with SKUs and barcodes", () => {
    const result = build();
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.rows.map((r) => [r.size, r.color])).toEqual([
      ["S", "Black"],
      ["M", "Black"],
    ]);
    expect(result.rows[0].sku.startsWith("ABAYA-")).toBe(true);
    expect(new Set(result.rows.map((r) => r.barcode)).size).toBe(2);
    expect(result.rows[0]).toMatchObject({ cost_price: 12, selling_price: 30, sale_price: "" });
  });

  it("uses per-size stock when the plan has it", () => {
    const result = build({ plan: plan({ size_stock_map: { M: 9 } }) });
    if (result.kind !== "ok") throw new Error("expected rows");
    expect(result.rows.map((r) => r.stock_main)).toEqual([5, 9]);
  });

  it("applies a valid sale price to every row", () => {
    const result = build({ salePriceText: "24" });
    if (result.kind !== "ok") throw new Error("expected rows");
    expect(result.rows.every((r) => r.selling_price === 24 && r.sale_price === "24")).toBe(true);
  });

  it("rejects more than 100 combinations, a missing base SKU, or a sale above the price", () => {
    const many = Array.from({ length: 11 }, (_, i) => `S${i}`).join(", ");
    expect(build({ sizesText: many, colorsText: many })).toEqual({
      kind: "error",
      reason: "too-many",
    });
    expect(build({ plan: plan({ base_sku: " " }) })).toEqual({
      kind: "error",
      reason: "missing-base-sku",
    });
    expect(build({ salePriceText: "31" })).toEqual({ kind: "error", reason: "invalid-sale-price" });
  });
});

describe("hasInvalidBulkRows", () => {
  const row = (overrides: Partial<BulkVariantRow> = {}): BulkVariantRow => ({
    size: "S",
    size_unit: "",
    color: "",
    fabric: "",
    sku: "A-S",
    barcode: "111",
    cost_price: 1,
    selling_price: 30,
    sale_price: "",
    stock_main: 1,
    stock_incubator: 0,
    ...overrides,
  });

  it("accepts a clean batch", () => {
    expect(hasInvalidBulkRows([row(), row({ sku: "A-M", barcode: "222" })], [], 30)).toBe(false);
  });

  it("flags duplicates within the batch or against existing variants (case-insensitive)", () => {
    expect(hasInvalidBulkRows([row(), row({ barcode: "222" })], [], 30)).toBe(true);
    expect(hasInvalidBulkRows([row()], [{ sku: "a-s", barcode: null }], 30)).toBe(true);
  });

  it("flags bad prices and stock", () => {
    expect(hasInvalidBulkRows([row({ sale_price: "40" })], [], 30)).toBe(true);
    expect(hasInvalidBulkRows([row({ stock_main: 1.5 })], [], 30)).toBe(true);
    expect(hasInvalidBulkRows([row({ cost_price: -1 })], [], 30)).toBe(true);
  });
});

describe("bulk pricing", () => {
  it("sells at the sale price and keeps the regular price as original", () => {
    expect(bulkRowPricing("24", 30)).toEqual({ selling_price: 24, original_price: 30 });
    expect(bulkRowPricing("", 30)).toEqual({ selling_price: 30, original_price: null });
    expect(bulkRowPricing("30", 30)).toEqual({ selling_price: 30, original_price: null });
  });

  it("validates the apply-to-all sale price", () => {
    expect(batchSalePriceValue("24", 30)).toBe("24");
    expect(batchSalePriceValue("0", 30)).toBe("");
    expect(batchSalePriceValue("31", 30)).toBeNull();
    expect(batchSalePriceValue("x", 30)).toBeNull();
  });
});

describe("parsedPlanMessage", () => {
  it("names what the parser found", () => {
    expect(parsedPlanMessage(3, 2, false)).toBe("Extracted 3 sizes and 2 colors");
    expect(parsedPlanMessage(3, 0, false)).toBe("Extracted 3 sizes");
    expect(parsedPlanMessage(0, 2, false)).toBe("Extracted 2 colors");
    expect(parsedPlanMessage(0, 0, false)).toBe("Data extracted successfully");
    expect(parsedPlanMessage(3, 2, true)).toBe("تم استخراج 3 مقاس و 2 لون بنجاح");
    expect(parsedPlanMessage(0, 0, true)).toBe("تم تحليل البيانات بنجاح");
  });
});
