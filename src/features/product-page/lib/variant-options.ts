import type { StorefrontVariant as Variant } from "@/lib/data/storefront";
import type { BrandAddonRow } from "@/lib/addons/addon-types";
import { resolveAllVariantAxes, variantAxisDefaultsFrom } from "@/lib/addons/addon-registry";
import { isColorSwatchAxis } from "@/lib/variant-axes";
import { isDefaultSize } from "@/lib/default-variant";
import {
  productAvailability,
  readyUnitsOf,
  type AvailabilityProduct,
  offSaleUntil,
} from "@/lib/product-availability";

/**
 * Pure rules for the product page's option pickers: variant order, the values
 * offered on each axis, which values are out of stock given the other choices,
 * and which variants match the current selection.
 */

export type VariantSelection = {
  size: string | null;
  color: string | null;
  fabric: string | null;
  four: string | null;
  five: string | null;
};

/** Natural sort key: extract leading number so "52" < "54" < "60". */
export function variantSortKey(v: Variant): [number, string] {
  const label = [v.size, v.color, v.fabric].filter(Boolean).join(" · ");
  const m = /-?\d+(?:\.\d+)?/.exec(label);
  const num = m ? Number(m[0]) : Number.POSITIVE_INFINITY;
  return [num, label.toLowerCase()];
}

export function sortVariants(list: Variant[]): Variant[] {
  return [...list].sort((a, b) => {
    const [an, al] = variantSortKey(a);
    const [bn, bl] = variantSortKey(b);
    if (an !== bn) return an - bn;
    return al.localeCompare(bl, undefined, { numeric: true, sensitivity: "base" });
  });
}

/** Distinct non-empty values of one variant field, in variant order. */
export function uniqueOptionValues(
  variants: Variant[],
  pick: (v: Variant) => string | null | undefined,
): string[] {
  const values = variants.map(pick).filter(Boolean) as string[];
  return Array.from(new Set(values));
}

/**
 * Sizes to offer. A size that names nothing (the default variant's) is never one: it was once
 * offered as قياسي beside a product's real sizes when the merchant added them after the default.
 */
export function offeredSizes(variants: Variant[]): string[] {
  const sizes = variants.filter((v) => !isDefaultSize(v.size)).map((v) => v.size as string);
  return Array.from(new Set(sizes));
}

const AXIS_FIELD = {
  size: "size",
  color: "color",
  fabric: "fabric",
  four: "option_four",
  five: "option_five",
} as const;

type Axis = keyof typeof AXIS_FIELD;

/** Whether a variant fits every chosen option (unchosen axes match anything). */
function matchesSelection(v: Variant, selection: VariantSelection, skip?: Axis): boolean {
  return (Object.keys(AXIS_FIELD) as Axis[]).every((axis) => {
    if (axis === skip) return true;
    const chosen = selection[axis];
    return !chosen || v[AXIS_FIELD[axis]] === chosen;
  });
}

/** Variants that fit the current (possibly partial) selection. */
export function matchingVariantsFor(variants: Variant[], selection: VariantSelection): Variant[] {
  return variants.filter((v) => matchesSelection(v, selection));
}

/**
 * For each value of one axis: true when no variant with that value and the
 * other chosen options is in stock (or none exists).
 */
export function outOfStockByValue(
  variants: Variant[],
  axis: "size" | "color" | "fabric",
  values: string[],
  selection: VariantSelection,
): Record<string, boolean> {
  return values.reduce(
    (acc, value) => {
      const matching = variants.filter(
        (v) => v[AXIS_FIELD[axis]] === value && matchesSelection(v, selection, axis),
      );
      acc[value] =
        matching.length === 0 ||
        matching.every((v) => Number(v.stock_main ?? 0) + Number(v.stock_incubator ?? 0) <= 0);
      return acc;
    },
    {} as Record<string, boolean>,
  );
}

/** The values offered on each option (the pickers' values), for chosenVariant. */
export type OfferedOptions = Record<Axis, readonly string[]>;

/** Pieces a variant can sell: the store's and its partners'. */
const unitsOf = (v: Variant) => Number(v.stock_main ?? 0) + Number(v.stock_incubator ?? 0);

/**
 * The variant the shopper's choice names, or null while it names none: every
 * option offered with more than one value has to be chosen. Nothing is chosen
 * for the shopper. The page once read "nothing chosen" as "anything fits" and
 * took the first variant, so it opened on a size that could be out of stock
 * ("notify me" for a piece that was on the shelf in other sizes) and could add
 * a size the shopper never picked. Where the options still leave several
 * variants (values the pickers do not tell apart), one in stock comes first.
 */
export function chosenVariant(
  variants: Variant[],
  selection: VariantSelection,
  offered: OfferedOptions,
): Variant | null {
  const open = (Object.keys(AXIS_FIELD) as Axis[]).some(
    (axis) => offered[axis].length > 1 && !selection[axis],
  );
  if (open) return null;
  const fitting = matchingVariantsFor(variants, selection);
  return fitting.find((v) => unitsOf(v) > 0) ?? fitting[0] ?? null;
}

/**
 * The variant whose photo the gallery shows while the choice is partial (a
 * colour picked, no size yet): the first fitting one with a photo, one in
 * stock first. None until something is chosen, so the page opens on the
 * product's own photos.
 */
export function previewVariant(variants: Variant[], selection: VariantSelection): Variant | null {
  if (!Object.values(selection).some(Boolean)) return null;
  const withPhoto = matchingVariantsFor(variants, selection).filter((v) => Boolean(v.image_url));
  return withPhoto.find((v) => unitsOf(v) > 0) ?? withPhoto[0] ?? null;
}

/**
 * Whether the page offers "notify me" instead of adding to the cart: the
 * chosen variant has no piece or, with nothing chosen yet, the product as a
 * whole cannot be bought (the one availability rule: a made-to-order piece
 * can be bought with no ready stock). Never while it is being made to order.
 */
export function choiceUnavailable({
  variant,
  variants,
  product,
  isTailoringActive,
}: {
  variant: Variant | null | undefined;
  variants: Variant[];
  product: AvailabilityProduct;
  isTailoringActive: boolean;
}): boolean {
  // Taken off sale for a while: nothing can be bought, made to order or not.
  if (offSaleUntil(product)) return true;
  if (isTailoringActive) return false;
  if (variant) return unitsOf(variant) <= 0;
  if (variants.length === 0) return false;
  return !productAvailability(product, readyUnitsOf(variants)).sellable;
}

/** "+ 5 BHD" in a customer's option value adds 5 to the price. */
export function parsePriceDelta(valStr: string): number {
  if (!valStr) return 0;
  const match = /\+\s*(\d+(?:\.\d+)?)\s*(?:BHD|BHD\b|د\.ب|BHD|BD\b|BD)?/i.exec(valStr);
  if (match) {
    return Number(match[1]);
  }
  return 0;
}

/**
 * What a shopper's answer to one of the product's fields adds to the price. Only a choice the
 * product really offers in a select field can carry a price: free text a shopper types (a note
 * saying "+2 cm") never does. The order function prices a line by the same rule
 * (storefront_line_customizations, migration 20261011100000).
 */
export function fieldPriceDelta(
  field: { type?: string | null; options?: readonly string[] | null },
  value: string | null | undefined,
): number {
  const chosen = (value ?? "").trim();
  if (!chosen || field.type !== "select") return 0;
  const offered = (field.options ?? []).some((option) => String(option).trim() === chosen);
  return offered ? parsePriceDelta(chosen) : 0;
}

type AxisConfig = { visible: boolean };
type AxesByKey<A extends AxisConfig> = Record<"size" | "color" | "fabric" | "four" | "five", A>;

/** An axis is shown when the store shows it or when the product has values for it. */
export function withOfferedAxes<A extends AxisConfig>(
  base: AxesByKey<A>,
  offered: Record<"size" | "color" | "fabric" | "four" | "five", string[]>,
): AxesByKey<A> {
  return {
    size: { ...base.size, visible: base.size.visible || offered.size.length > 0 },
    color: { ...base.color, visible: base.color.visible || offered.color.length > 0 },
    fabric: { ...base.fabric, visible: base.fabric.visible || offered.fabric.length > 0 },
    four: { ...base.four, visible: base.four.visible || offered.four.length > 0 },
    five: { ...base.five, visible: base.five.visible || offered.five.length > 0 },
  };
}

/**
 * The product page's option axes: labels from the product's own overrides,
 * the store vertical and its addon packs; an axis shows when the store shows
 * it or the product offers values. Colour swatches only when the colour slot
 * really holds colours (a roastery keeps the roast there).
 */
export function resolveProductAxes({
  product,
  addons,
  storeVertical,
  lang,
  offered,
}: {
  product: Parameters<typeof resolveAllVariantAxes>[0]["product"];
  addons: BrandAddonRow[] | null | undefined;
  storeVertical: string | null | undefined;
  lang: "ar" | "en";
  offered: Record<"size" | "color" | "fabric" | "four" | "five", string[]>;
}) {
  const axes = withOfferedAxes(
    resolveAllVariantAxes({
      product,
      addonDefaults: variantAxisDefaultsFrom(addons, storeVertical),
      lang,
    }),
    offered,
  );
  return { axes, isVisualColorAxis: isColorSwatchAxis(axes.color.label, offered.color) };
}

/**
 * Ready size vs tailoring on a made-to-order product. Ready sizes are real
 * sizes only (placeholder variants carry none). The ready/custom toggle shows
 * when the store has the made-to-order module, the product offers ready sizes
 * and has measurement fields; without ready sizes the product is tailored only.
 */
export function tailoringState({
  isMadeToOrder,
  offeredSizes,
  hasCustomFields,
  madeToOrderModule,
  sizeMode,
}: {
  isMadeToOrder: boolean;
  offeredSizes: readonly string[];
  hasCustomFields: boolean;
  madeToOrderModule: boolean;
  sizeMode: "ready" | "custom";
}) {
  const hasReadySizes = offeredSizes.length > 0;
  const showSizeModeToggle = madeToOrderModule && hasReadySizes && hasCustomFields && isMadeToOrder;
  const isTailoringActive =
    isMadeToOrder && ((showSizeModeToggle && sizeMode === "custom") || !showSizeModeToggle);
  return {
    hasReadySizes,
    showSizeModeToggle,
    isTailoringActive,
    /** A made-to-order product without ready sizes can only be tailored. */
    tailoredOnly: isMadeToOrder && !hasReadySizes,
  };
}

/**
 * Whether the chosen option reads "Custom Sizing" instead of its size: the
 * shopper picked custom on the ready/custom toggle, or the product is
 * tailored only. Ready-to-wear items keep their size even with custom fields.
 */
export function showsCustomSizing({
  showSizeModeToggle,
  sizeMode,
  hasReadySizes,
  isTailoringActive,
}: {
  showSizeModeToggle: boolean;
  sizeMode: "ready" | "custom";
  hasReadySizes: boolean;
  isTailoringActive: boolean;
}): boolean {
  return (showSizeModeToggle && sizeMode === "custom") || (!hasReadySizes && isTailoringActive);
}
