import type { StorefrontVariant as Variant } from "@/lib/data/storefront";
import type { BrandAddonRow } from "@/lib/addons/addon-types";
import { resolveAllVariantAxes, variantAxisDefaultsFrom } from "@/lib/addons/addon-registry";
import { isColorSwatchAxis } from "@/lib/variant-axes";
import { isPlaceholderVariant } from "@/lib/variant-sku-utils";

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

/** Sizes to offer; placeholder sizes are hidden unless every variant is a placeholder. */
export function offeredSizes(variants: Variant[]): string[] {
  const allPlaceholder = variants.length > 0 && variants.every(isPlaceholderVariant);
  const sizes = variants
    .filter((v) => !allPlaceholder || !isPlaceholderVariant(v))
    .map((v) => v.size)
    .filter(Boolean) as string[];
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

/** "+ 5 BHD" in a customer's option value adds 5 to the price. */
export function parsePriceDelta(valStr: string): number {
  if (!valStr) return 0;
  const match = /\+\s*(\d+(?:\.\d+)?)\s*(?:BHD|BHD\b|د\.ب|BHD|BD\b|BD)?/i.exec(valStr);
  if (match) {
    return Number(match[1]);
  }
  return 0;
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
