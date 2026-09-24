import type { StorefrontVariant as Variant } from "@/lib/data/storefront";

/**
 * Pure price rules for the product page. `addOn` is the extra from chosen
 * customizations and add-ons, already included in every price shown.
 */

/** Lowest and highest price among the variants that fit the selection. */
export function matchingPriceRange(
  matchingPrices: number[],
  basePrice: number,
  addOn: number,
): { min: number; max: number } {
  if (matchingPrices.length === 0) return { min: basePrice + addOn, max: basePrice + addOn };
  return { min: Math.min(...matchingPrices), max: Math.max(...matchingPrices) };
}

/** The unique matching variant's price, else the lowest matching price. */
export function displayPriceFor(
  matchingVariants: Variant[],
  basePrice: number,
  addOn: number,
  minMatchingPrice: number,
): number {
  const matched = matchingVariants.length === 1 ? matchingVariants[0] : null;
  return matched ? Number(matched.selling_price || basePrice) + addOn : minMatchingPrice;
}

/**
 * The struck-through "was" price for a single price (0 when there is none):
 * the variant's own original price when it is above its selling price, else
 * the product's original price shifted by the variant's price difference.
 */
export function originalPriceFor({
  isRange,
  variant,
  basePrice,
  productOriginalPrice,
}: {
  isRange: boolean;
  variant: Variant | null | undefined;
  basePrice: number;
  productOriginalPrice: number;
}): number {
  const variantPriceDelta = variant ? Number(variant.selling_price || basePrice) - basePrice : 0;
  const variantOriginalDelta = variant
    ? Number(variant.original_price || basePrice) - basePrice
    : 0;
  if (!isRange && variantOriginalDelta > variantPriceDelta) return basePrice + variantOriginalDelta;
  if (!isRange && productOriginalPrice > basePrice) return productOriginalPrice + variantPriceDelta;
  return 0;
}

/** Whole-percent discount from the original price, or 0. */
export function discountPercentFor(originalPriceWithAddons: number, displayPrice: number): number {
  return originalPriceWithAddons > displayPrice
    ? Math.round((1 - displayPrice / originalPriceWithAddons) * 100)
    : 0;
}
