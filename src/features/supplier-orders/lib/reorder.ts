import { isStockProduct, type CatalogProduct, type CatalogVariant } from "./catalog";
import { isOpen, type SupplierOrder } from "./order-state";
import { MAX_PIECES, formKey, type FormProduct, type SupplierOrderForm } from "./order-form";

/**
 * What to order again: the sizes that will run out soon at the rate they sell, after what is
 * already on its way from a supplier, with how many pieces would cover the weeks ahead. The
 * inventory showed each size's days left; nothing turned that into an order. Ticked sizes open a
 * new supplier order with them filled in (`reorderParam` → `formFromReorder`).
 */

/** The sales a rate is worked from: the last 45 days (the inventory's own window). */
export const REORDER_WINDOW_DAYS = 45;
/** A size is suggested when what it has, and what is coming, lasts no longer than this. */
export const REORDER_HORIZON_DAYS = 21;
/** A suggestion orders enough for this many days of sales. */
export const COVER_DAYS = 45;
/** The most sizes one suggestion carries to a new order. */
export const MAX_REORDER_LINES = 60;

const DAY_MS = 86_400_000;

export type ReorderLine = {
  productId: string;
  variantId: string;
  onHand: number;
  onOrder: number;
  /** Pieces sold a day, over the window (or the size's age, when younger). */
  perDay: number;
  /** Days until what it has and what is coming runs out. */
  daysLeft: number;
  suggested: number;
};

/** Pieces of the store's own sizes still to come from open supplier orders (never a customer's). */
export function onOrderByVariant(orders: readonly SupplierOrder[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const order of orders) {
    if (!isOpen(order)) continue;
    for (const line of order.items) {
      if (!line.variant_id || line.order_item_id) continue;
      const left = Math.max(0, line.quantity - line.received_quantity);
      if (left > 0) map.set(line.variant_id, (map.get(line.variant_id) ?? 0) + left);
    }
  }
  return map;
}

/** Pieces sold per size, from the sold orders the inventory reads (`ordersQueries.variantSales`). */
export function soldByVariant(
  orders: ReadonlyArray<{
    order_items?: Array<{ variant_id?: string | null; quantity?: number | null }> | null;
  }>,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const order of orders) {
    for (const item of order.order_items ?? []) {
      if (!item.variant_id) continue;
      map.set(item.variant_id, (map.get(item.variant_id) ?? 0) + Number(item.quantity ?? 0));
    }
  }
  return map;
}

type Product = CatalogProduct & { is_made_to_order?: boolean | null; is_active?: boolean | null };

/**
 * The sizes to order again, the soonest to run out first: a piece kept in stock (not made to
 * order, not a service or a package, not hidden) that sold in the window and whose stock and
 * pieces on order last no more than `REORDER_HORIZON_DAYS`.
 */
export function reorderSuggestions({
  products,
  variants,
  sold,
  onOrder,
  now = new Date(),
}: {
  products: readonly Product[];
  variants: readonly CatalogVariant[];
  sold: ReadonlyMap<string, number>;
  onOrder: ReadonlyMap<string, number>;
  now?: Date;
}): ReorderLine[] {
  const productById = new Map(products.map((p) => [p.id, p]));
  const lines: ReorderLine[] = [];
  for (const variant of variants) {
    const product = productById.get(variant.product_id);
    if (!product || !isStockProduct(product) || product.is_made_to_order) continue;
    if (product.is_active === false) continue;
    const pieces = sold.get(variant.id) ?? 0;
    if (pieces <= 0) continue;
    const age = variant.created_at
      ? Math.ceil((now.getTime() - new Date(variant.created_at).getTime()) / DAY_MS)
      : REORDER_WINDOW_DAYS;
    const days = Math.max(1, Math.min(REORDER_WINDOW_DAYS, age));
    const perDay = pieces / days;
    const onHand = Math.max(0, (variant.stock_main ?? 0) + (variant.stock_incubator ?? 0));
    const coming = onOrder.get(variant.id) ?? 0;
    const daysLeft = (onHand + coming) / perDay;
    if (daysLeft > REORDER_HORIZON_DAYS) continue;
    const suggested = Math.min(
      MAX_PIECES,
      Math.max(1, Math.ceil(perDay * COVER_DAYS - onHand - coming)),
    );
    lines.push({
      productId: product.id,
      variantId: variant.id,
      onHand,
      onOrder: coming,
      perDay,
      daysLeft: Math.floor(daysLeft),
      suggested,
    });
  }
  return lines.sort((a, b) => a.daysLeft - b.daysLeft || b.perDay - a.perDay);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The ticked sizes as a new order's address carries them: "variant:pieces,…". */
export function reorderParam(
  lines: ReadonlyArray<{ variantId: string; quantity: number }>,
): string {
  return lines
    .filter((line) => UUID.test(line.variantId) && line.quantity > 0)
    .slice(0, MAX_REORDER_LINES)
    .map((line) => `${line.variantId}:${Math.min(MAX_PIECES, Math.floor(line.quantity))}`)
    .join(",");
}

/** The sizes an address asks for, each once; anything that is not a size and a count is left out. */
export function readReorderParam(text: string | null | undefined): Array<{
  variantId: string;
  quantity: number;
}> {
  const seen = new Set<string>();
  const lines: Array<{ variantId: string; quantity: number }> = [];
  for (const part of String(text ?? "").split(",")) {
    const [variantId, count] = part.split(":");
    const quantity = Number(count);
    if (!UUID.test(variantId ?? "") || !Number.isInteger(quantity)) continue;
    if (quantity < 1 || quantity > MAX_PIECES || seen.has(variantId)) continue;
    seen.add(variantId);
    lines.push({ variantId, quantity });
    if (lines.length >= MAX_REORDER_LINES) break;
  }
  return lines;
}

/**
 * A new supplier order with the ticked sizes: one product line each, its sizes at the pieces
 * chosen and its cost what it was last bought at (as adding the product by hand starts it).
 * A size the catalog does not know is left out.
 */
export function formFromReorder(
  lines: ReadonlyArray<{ variantId: string; quantity: number }>,
  catalog: {
    variantById: ReadonlyMap<string, CatalogVariant>;
    sizes: ReadonlyMap<string, CatalogVariant[]>;
    shelf: ReadonlyMap<string, { cost: number }>;
  },
): SupplierOrderForm {
  const byProduct = new Map<string, FormProduct>();
  for (const line of lines) {
    const variant = catalog.variantById.get(line.variantId);
    if (!variant) continue;
    let product = byProduct.get(variant.product_id);
    if (!product) {
      const sizes = catalog.sizes.get(variant.product_id) ?? [];
      const cost = sizes.map((v) => catalog.shelf.get(v.id)?.cost ?? 0).find((c) => c > 0) ?? 0;
      product = {
        key: formKey(),
        productId: variant.product_id,
        unitCost: cost > 0 ? String(cost) : "",
        sizes: {},
      };
      byProduct.set(variant.product_id, product);
    }
    product.sizes[variant.id] = { quantity: String(line.quantity), received: 0 };
  }
  return { vendorId: "", expectedAt: "", notes: "", products: [...byProduct.values()], costs: [] };
}
