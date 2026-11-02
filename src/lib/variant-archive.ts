/**
 * An archived size: one removed from the inventory that has a history (it sold, its stock moved,
 * it is on a supplier order), so it was hidden rather than deleted (`remove_product_variants`,
 * migration 20261111100000). It is never offered: not on the store, not in the inventory, not
 * in a picker. It is still named where its history is read (a past supplier order's line).
 */

type Archivable = { archived_at?: string | null };

/** A size in use: not archived. */
export function inUse(variant: Archivable): boolean {
  return !variant.archived_at;
}

/** The sizes in use of a list, in its order. */
export function variantsInUse<V extends Archivable>(variants: readonly V[]): V[] {
  return variants.filter(inUse);
}
