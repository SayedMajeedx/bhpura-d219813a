/**
 * The product page's one rail of suggestions (the product page review of 2026-11-15): it had three
 * blocks one after another, the bundle ("Complete your order") and two rails, "You may also like"
 * (the same category) and "Customers also bought", which was the store's best sellers and never
 * what this product's customers bought.
 *
 * One rail, "You may also like": the same category first, then the store's best sellers, each
 * product once, leaving out what the bundle above it already offers.
 */
export const SUGGESTION_LIMIT = 12;

export function suggestionRail<T extends { id: string }>({
  related,
  bestSelling,
  exclude = [],
  limit = SUGGESTION_LIMIT,
}: {
  related: readonly T[];
  bestSelling: readonly T[];
  /** Products shown elsewhere on the page (the bundle's). */
  exclude?: readonly string[];
  limit?: number;
}): T[] {
  const seen = new Set(exclude);
  const rail: T[] = [];
  for (const item of [...related, ...bestSelling]) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    rail.push(item);
    if (rail.length >= limit) break;
  }
  return rail;
}
