/**
 * Choosing an offer's products by the partner shop that holds them (the owner's request of
 * 2026-11-14: Pura's partner shop put some of its ready pieces on sale, and the store wanted the
 * same price online). The offer still names products, so the merchant can untick any; this only
 * finds them. Which pieces of them the offer reaches is the offer's own (`pieces`: ready).
 */

export type PartnerStockRow = {
  incubator_id: string;
  quantity: number | string | null;
  product_variants?: { products?: { id: string } | null } | null;
};

export type PartnerChoice = { id: string; name: string; productIds: string[] };

/** The partner shops that hold a piece now, each with the products it holds, in the given order. */
export function partnersHolding(
  partners: readonly { id: string; name: string }[],
  stock: readonly PartnerStockRow[],
): PartnerChoice[] {
  const held = new Map<string, Set<string>>();
  for (const row of stock) {
    const productId = row.product_variants?.products?.id;
    if (!productId || !(Number(row.quantity) > 0)) continue;
    const set = held.get(row.incubator_id) ?? new Set<string>();
    set.add(productId);
    held.set(row.incubator_id, set);
  }
  return partners
    .filter((partner) => held.has(partner.id))
    .map((partner) => ({
      id: partner.id,
      name: partner.name,
      productIds: [...(held.get(partner.id) ?? [])],
    }));
}

/** The chosen products with every product shown added, or every product shown taken away. */
export function withShown(
  chosen: readonly string[],
  shown: readonly string[],
  add: boolean,
): string[] {
  if (add) return [...new Set([...chosen, ...shown])];
  const away = new Set(shown);
  return chosen.filter((id) => !away.has(id));
}
