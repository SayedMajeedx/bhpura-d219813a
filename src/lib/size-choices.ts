import { isDefaultSize } from "@/lib/default-variant";

/**
 * Choosing a new product's sizes in one tap: the sizes the store already sells, plus any typed by
 * hand. Used where a product is first made (the product editor, a supplier order's new product).
 */

/** The most sizes offered in one tap. */
const USUAL_SIZES = 10;

/**
 * The sizes the store sells most, in the order it first used them: what a new product of the
 * same store is likely to come in. A one-size product's default variant has none.
 */
export function usualSizes(variants: ReadonlyArray<{ size: string | null }>): string[] {
  const seen = new Map<string, { count: number; first: number }>();
  variants.forEach((variant, index) => {
    const size = variant.size?.trim();
    if (!size || isDefaultSize(size)) return;
    const entry = seen.get(size) ?? { count: 0, first: index };
    entry.count += 1;
    seen.set(size, entry);
  });
  return [...seen.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[1].first - b[1].first)
    .slice(0, USUAL_SIZES)
    .sort((a, b) => a[1].first - b[1].first)
    .map(([size]) => size);
}

/** A size typed by hand, added once (the same size in another case is the same size). */
export function withSize(sizes: readonly string[], typed: string): string[] {
  const size = typed.trim().slice(0, 40);
  if (isDefaultSize(size)) return [...sizes];
  if (sizes.some((s) => s.toLocaleLowerCase() === size.toLocaleLowerCase())) return [...sizes];
  return [...sizes, size];
}

/** A size ticked or unticked, keeping the order they were chosen in. */
export function toggledSize(sizes: readonly string[], size: string): string[] {
  return sizes.includes(size) ? sizes.filter((s) => s !== size) : [...sizes, size];
}
