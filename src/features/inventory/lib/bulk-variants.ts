import type { VariantGenerationPlan } from "@/lib/generate-variants.functions";
import { formatSkuToken, makeEan13, splitVariantValues } from "@/lib/variant-sku-utils";
import type { BulkVariantRow } from "@/features/inventory/types";

/**
 * Pure rules for the bulk "generate variants" dialog: building the size ×
 * colour grid, validating it before insert, and pricing each row.
 */

export const MAX_BULK_VARIANTS = 100;

export type BulkPreviewResult =
  | { kind: "error"; reason: "too-many" | "missing-base-sku" | "invalid-sale-price" }
  | { kind: "ok"; rows: BulkVariantRow[] };

/** One row per size × colour; SKUs are BASE-COLOUR-SIZE, barcodes are new EAN-13s. */
export function buildBulkVariantRows({
  sizesText,
  colorsText,
  plan,
  basePrice,
  costPrice,
  salePriceText,
  existingBarcodes,
  makeBarcode = makeEan13,
}: {
  sizesText: string;
  colorsText: string;
  plan: VariantGenerationPlan;
  basePrice: number;
  costPrice: number;
  salePriceText: string;
  existingBarcodes: Iterable<string>;
  makeBarcode?: (used: Set<string>) => string;
}): BulkPreviewResult {
  const sizes = splitVariantValues(sizesText);
  const colors = splitVariantValues(colorsText);
  const combinations = Math.max(1, sizes.length) * Math.max(1, colors.length);
  if (combinations > MAX_BULK_VARIANTS) return { kind: "error", reason: "too-many" };
  if (!plan.base_sku.trim()) return { kind: "error", reason: "missing-base-sku" };

  const enteredSalePrice = salePriceText.trim() === "" ? null : Number(salePriceText);
  if (
    enteredSalePrice !== null &&
    (!Number.isFinite(enteredSalePrice) || enteredSalePrice < 0 || enteredSalePrice > basePrice)
  ) {
    return { kind: "error", reason: "invalid-sale-price" };
  }
  const salePrice =
    enteredSalePrice !== null && enteredSalePrice > 0 && enteredSalePrice < basePrice
      ? enteredSalePrice
      : null;

  const usedBarcodes = new Set(existingBarcodes);
  const sizeAxis = sizes.length ? sizes : [""];
  const colorAxis = colors.length ? colors : [""];

  const rows = sizeAxis.flatMap((size) =>
    colorAxis.map((color) => {
      const tokens = [color ? formatSkuToken(color) : "", size ? formatSkuToken(size) : ""]
        .filter(Boolean)
        .join("-");
      const sku = `${plan.base_sku.trim().toUpperCase()}${tokens ? `-${tokens}` : ""}`;
      const sizeSpecificStock =
        size && plan.size_stock_map && plan.size_stock_map[size] !== undefined
          ? plan.size_stock_map[size]
          : plan.stock_main;

      return {
        ...plan,
        stock_main: sizeSpecificStock,
        cost_price: costPrice,
        selling_price: salePrice ?? basePrice,
        sale_price: salePrice === null ? "" : String(salePrice),
        size,
        color,
        size_unit: plan.size_unit,
        sku,
        barcode: makeBarcode(usedBarcodes),
      } as BulkVariantRow;
    }),
  );
  return { kind: "ok", rows };
}

/**
 * True when any row cannot be saved: missing or duplicate SKU/barcode (against
 * existing variants and within the batch), a sale price above the regular
 * price, negative cost, or non-integer / negative stock.
 */
export function hasInvalidBulkRows(
  rows: readonly BulkVariantRow[],
  existingVariants: ReadonlyArray<{ sku: string | null; barcode: string | null }>,
  basePrice: number,
): boolean {
  const existingSkus = new Set(
    existingVariants.map((v) => v.sku?.trim().toUpperCase()).filter(Boolean),
  );
  const existingBarcodes = new Set(
    existingVariants.map((v) => v.barcode?.trim().toUpperCase()).filter(Boolean),
  );
  const seenSkus = new Set<string>();
  const seenBarcodes = new Set<string>();
  return rows.some((row) => {
    const sku = row.sku.trim().toUpperCase();
    const barcode = row.barcode.trim().toUpperCase();
    const bad =
      !sku ||
      !barcode ||
      existingSkus.has(sku) ||
      existingBarcodes.has(barcode) ||
      seenSkus.has(sku) ||
      seenBarcodes.has(barcode) ||
      (row.sale_price !== "" &&
        (!Number.isFinite(Number(row.sale_price)) ||
          Number(row.sale_price) < 0 ||
          Number(row.sale_price) > basePrice)) ||
      row.cost_price < 0 ||
      !Number.isInteger(row.stock_main) ||
      row.stock_main < 0 ||
      !Number.isInteger(row.stock_incubator) ||
      row.stock_incubator < 0;
    seenSkus.add(sku);
    seenBarcodes.add(barcode);
    return bad;
  });
}

/** A row on sale sells at its sale price and remembers the regular price as original. */
export function bulkRowPricing(
  salePriceText: string,
  basePrice: number,
): { selling_price: number; original_price: number | null } {
  const sale = Number(salePriceText);
  const onSale = sale > 0 && sale < basePrice;
  return { selling_price: onSale ? sale : basePrice, original_price: onSale ? basePrice : null };
}

/** Value for "apply sale price to all rows": null when invalid, "" to clear the sale. */
export function batchSalePriceValue(input: string, basePrice: number): string | null {
  const value = Number(input);
  if (isNaN(value) || value < 0 || value > basePrice) return null;
  return value > 0 && value < basePrice ? String(value) : "";
}

/** Toast text after the AI (or quick) parser fills the plan. */
export function parsedPlanMessage(sizeCount: number, colorCount: number, isAr: boolean): string {
  if (isAr) {
    if (sizeCount > 0 && colorCount > 0)
      return `تم استخراج ${sizeCount} مقاس و ${colorCount} لون بنجاح`;
    if (sizeCount > 0) return `تم استخراج ${sizeCount} مقاس بنجاح`;
    if (colorCount > 0) return `تم استخراج ${colorCount} ألوان بنجاح`;
    return "تم تحليل البيانات بنجاح";
  }
  if (sizeCount > 0 && colorCount > 0)
    return `Extracted ${sizeCount} sizes and ${colorCount} colors`;
  if (sizeCount > 0) return `Extracted ${sizeCount} sizes`;
  if (colorCount > 0) return `Extracted ${colorCount} colors`;
  return "Data extracted successfully";
}
