import { splitCompositeVariantSize } from "@/lib/format";
import { SIZE_UNITS } from "@/features/inventory/lib/size-units";
import type { Product, Variant } from "@/features/inventory/types";

/**
 * Rules for adding and editing variants in the variants table: the new-variant
 * draft, barcode checks, and the column values sent to the database.
 */

/** The add-variant form's values, as typed (strings). */
export type VariantDraft = {
  size: string;
  size_unit: string;
  color: string;
  fabric: string;
  option_four: string;
  option_five: string;
  sku: string;
  barcode: string;
  cost_price: string;
  selling_price: string;
  original_price: string;
  stock_main: string;
  stock_incubator: string;
  image_url: string;
};

export function emptyVariantDraft(product?: Product): VariantDraft {
  return {
    size: "",
    size_unit: "",
    color: "",
    fabric: "",
    option_four: "",
    option_five: "",
    sku: "",
    barcode: "",
    cost_price: String(product?.cost_price ?? 0),
    selling_price: "",
    original_price: "",
    stock_main: "0",
    stock_incubator: "0",
    image_url: "",
  };
}

/**
 * Draft for "add variant". Duplicating copies everything except the colour
 * (the merchant types the new option); otherwise the size, unit and price of
 * the existing variants are reused to save typing.
 */
export function newVariantDraft(
  product: Product | undefined,
  variants: Variant[],
  cloneFrom?: Variant,
): VariantDraft {
  const empty = emptyVariantDraft(product);
  if (cloneFrom) {
    return {
      ...empty,
      size: cloneFrom.size ?? "",
      size_unit: cloneFrom.size_unit ?? "",
      color: "",
      fabric: cloneFrom.fabric ?? "",
      option_four: cloneFrom.option_four ?? "",
      option_five: cloneFrom.option_five ?? "",
      cost_price: String(cloneFrom.cost_price ?? product?.cost_price ?? 0),
      selling_price: cloneFrom.selling_price ? String(cloneFrom.selling_price) : "",
      original_price: cloneFrom.original_price
        ? String(cloneFrom.original_price)
        : String(product?.base_price ?? 0),
      stock_main: String(cloneFrom.stock_main ?? 0),
      stock_incubator: String(cloneFrom.stock_incubator ?? 0),
    };
  }
  const existingSize = variants.find((v) => v.size)?.size ?? "";
  const existingUnit = variants.find((v) => v.size_unit)?.size_unit ?? (SIZE_UNITS[0] || "");
  const existingPrice =
    variants.length > 0 && variants[0].selling_price ? String(variants[0].selling_price) : "";
  return {
    ...empty,
    size: existingSize,
    size_unit: existingUnit,
    cost_price: String(product?.cost_price ?? 0),
    selling_price: existingPrice,
    original_price: String(product?.base_price ?? 0),
  };
}

/** In-store EAN-13 (prefix 29) with a valid check digit. */
export function makeInStoreBarcode(): string {
  const random = new Uint32Array(1);
  crypto.getRandomValues(random);
  const body = `29${Date.now().toString().slice(-6)}${String(random[0] % 10000).padStart(4, "0")}`;
  const weightedSum = body
    .split("")
    .reduce((sum, digit, index) => sum + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return `${body}${(10 - (weightedSum % 10)) % 10}`;
}

/** Scanner input can carry control characters; compare barcodes without them or case. */
export function normalizeBarcode(value: unknown): string {
  return String(value ?? "")
    .replace(/\p{Cc}/gu, "")
    .trim()
    .toUpperCase();
}

export function isBarcodeInUse(
  variants: Array<Pick<Variant, "id" | "barcode">>,
  value: unknown,
  exceptId?: string,
): boolean {
  const normalized = normalizeBarcode(value);
  return (
    !!normalized &&
    variants.some(
      (variant) => variant.id !== exceptId && normalizeBarcode(variant.barcode) === normalized,
    )
  );
}

export type VisibleVariantAxes = Record<"size" | "color" | "fabric" | "four" | "five", boolean>;

/**
 * Column values for inserting a draft. Hidden axes are saved empty (colour is
 * kept when typed), and a composite size like "700 - Dark" with no colour is
 * split into size, unit and colour. `color` is the colour actually saved.
 */
export function newVariantValues(
  row: VariantDraft,
  visible: VisibleVariantAxes,
  product?: Product,
) {
  const split = splitCompositeVariantSize(row.size, row.size_unit);
  let finalSize = row.size;
  let finalUnit = row.size_unit;
  let finalColor = row.color;

  if (split.isComposite && !finalColor) {
    finalSize = split.size;
    finalUnit = split.unit;
    finalColor = split.option;
  }

  return {
    color: finalColor,
    values: {
      size: (visible.size ? finalSize : null) || null,
      size_unit: (visible.size ? finalUnit : null) || null,
      color: (visible.color || finalColor ? finalColor : null) || null,
      fabric: (visible.fabric ? row.fabric : null) || null,
      option_four: (visible.four ? row.option_four : null) || null,
      option_five: (visible.five ? row.option_five : null) || null,
      sku: row.sku || null,
      barcode: row.barcode.trim() || null,
      cost_price: Number(product?.cost_price ?? 0),
      selling_price: row.selling_price
        ? Number(row.selling_price)
        : Number(product?.base_price ?? 0),
      original_price:
        row.selling_price && Number(row.selling_price) < Number(product?.base_price ?? 0)
          ? Number(product?.base_price ?? 0)
          : null,
      stock_main: Number(row.stock_main),
      stock_incubator: Number(row.stock_incubator),
      stock: Number(row.stock_main || 0) + Number(row.stock_incubator || 0),
      image_url: row.image_url || null,
    },
  };
}

/**
 * The column update for an inline edit. Stock is left out (it goes through the
 * stock ledger); a new price below the regular price keeps that as the original.
 */
export function variantColumnPatch(
  patch: Partial<Variant>,
  regularPrice: number,
): Partial<Variant> {
  const normalizedPatch: Partial<Variant> = { ...patch };
  delete normalizedPatch.stock_main;
  delete normalizedPatch.stock_incubator;
  delete normalizedPatch.stock;

  if (typeof patch.selling_price === "number") {
    normalizedPatch.original_price = patch.selling_price < regularPrice ? regularPrice : null;
  }
  return normalizedPatch;
}
