import { isDefaultVariant } from "@/lib/default-variant";
import { firstSizes, piecesQuestion, type FirstSizes } from "@/features/inventory/lib/first-sizes";
import type { CatalogVariant } from "./catalog";

/**
 * Sizes or colours a product does not have yet, added from a supplier's order: the supplier makes
 * them, so they are recorded where the merchant is (the owner's request of 2026-11-03). What the
 * merchant asked for is matched against the product's sizes first, so a size is never made twice:
 * one in use is simply ordered, one archived comes back with its history
 * (`restore_product_variant`), and only the rest are made.
 */

export type SizeChoice = { size: string | null; color: string | null };

type Options = Pick<CatalogVariant, "size" | "color" | "fabric" | "option_four" | "option_five">;

const fold = (value: string | null | undefined) =>
  (value ?? "").trim().toLocaleLowerCase().normalize("NFKC");

/** One size's options as one key: two sizes with the same options are the same size. */
export function optionKey(variant: Partial<Options>): string {
  return [variant.size, variant.color, variant.fabric, variant.option_four, variant.option_five]
    .map(fold)
    .join("|");
}

const tidy = (values: readonly string[]) => {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (!value || seen.has(fold(value))) continue;
    seen.add(fold(value));
    kept.push(value);
  }
  return kept;
};

/** Every size with every colour asked for (a list left empty is not an option), each once. */
export function wantedSizes(sizes: readonly string[], colors: readonly string[]): SizeChoice[] {
  const s = tidy(sizes);
  const c = tidy(colors);
  if (s.length === 0 && c.length === 0) return [];
  const sizeList = s.length ? s : [null];
  const colorList = c.length ? c : [null];
  return sizeList.flatMap((size) => colorList.map((color) => ({ size, color })));
}

/**
 * The options every real size of the product shares beyond size and colour (all its sizes are in
 * crepe: a new size is crepe too), so a new size reads as the product's own.
 */
export function sharedOptions(
  inUse: readonly CatalogVariant[],
): Pick<Options, "fabric" | "option_four" | "option_five"> {
  const real = inUse.filter((v) => !isDefaultVariant(v));
  const shared = (field: "fabric" | "option_four" | "option_five") => {
    const values = new Set(real.map((v) => v[field]?.trim() || ""));
    const [only] = [...values];
    return values.size === 1 && only ? only : null;
  };
  return {
    fabric: shared("fabric"),
    option_four: shared("option_four"),
    option_five: shared("option_five"),
  };
}

export type SizePlan =
  | { choice: SizeChoice; kind: "has"; variantId: string }
  | { choice: SizeChoice; kind: "restore"; variantId: string }
  | { choice: SizeChoice; kind: "new" };

/** What each size asked for is: one the product has, one archived to bring back, or a new one. */
export function planNewSizes(
  wanted: readonly SizeChoice[],
  inUse: readonly CatalogVariant[],
  archived: readonly CatalogVariant[],
): SizePlan[] {
  const extra = sharedOptions(inUse);
  const byKey = (list: readonly CatalogVariant[]) =>
    new Map(list.filter((v) => !isDefaultVariant(v)).map((v) => [optionKey(v), v.id]));
  const has = byKey(inUse);
  const gone = byKey(archived);
  return wanted.map((choice) => {
    // A size is the same whether or not it carries the options all the others share.
    const keys = [optionKey({ ...choice }), optionKey({ ...extra, ...choice })];
    const own = keys.map((key) => has.get(key)).find(Boolean);
    if (own) return { choice, kind: "has", variantId: own };
    const back = keys.map((key) => gone.get(key)).find(Boolean);
    if (back) return { choice, kind: "restore", variantId: back };
    return { choice, kind: "new" };
  });
}

/**
 * A new size's price: the one every size of the product sells at (with the struck price they
 * share), else the product's own price.
 */
export function newSizePrice(
  inUse: ReadonlyArray<{ selling_price?: number | null; original_price?: number | null }>,
  basePrice: number,
): { selling_price: number; original_price: number | null } {
  const prices = new Set(inUse.map((v) => `${v.selling_price ?? ""}/${v.original_price ?? ""}`));
  const first = inUse[0];
  if (prices.size === 1 && first && Number(first.selling_price) > 0) {
    return {
      selling_price: Number(first.selling_price),
      original_price: first.original_price == null ? null : Number(first.original_price),
    };
  }
  return { selling_price: Math.max(0, basePrice || 0), original_price: null };
}

/** A new size's row: its options, its price and no stock (receiving adds pieces and cost). */
export function newSizeRow(
  choice: SizeChoice,
  inUse: readonly CatalogVariant[],
  price: { selling_price: number; original_price: number | null },
) {
  return {
    size: choice.size,
    size_unit: null,
    color: choice.color,
    ...sharedOptions(inUse),
    sku: null,
    barcode: null,
    ...price,
    stock_main: 0,
    stock_incubator: 0,
    stock: 0,
  };
}

/**
 * How the product's default (sold with no options) meets its new sizes: the inventory's rule
 * (`firstSizes`), except that a default this order already orders becomes one of them too, so
 * the order's line follows it instead of pointing at a size that was removed.
 */
export function orderFirstSizes(
  inUse: readonly CatalogVariant[],
  onThisOrder: (variantId: string) => boolean,
): FirstSizes {
  const first = firstSizes(inUse);
  if (first.kind === "replace" && onThisOrder(first.defaultId)) {
    return { kind: "become", defaultId: first.defaultId, pieces: 0 };
  }
  return first;
}

/** The question asked when the default becomes one of the new sizes. */
export function defaultQuestion(pieces: number, isAr: boolean): string {
  if (pieces > 0) return piecesQuestion(pieces, isAr);
  return isAr
    ? "هذه الطلبية فيها المنتج «بدون خيارات». من أي مقاس هو؟"
    : 'This order already has the product with "No options". Which size is it?';
}
