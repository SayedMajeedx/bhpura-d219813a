import type { CartItem } from "@/lib/storefront-context";
import type { AdvanceLine } from "@/lib/payments/advance-rules";

/**
 * The cart's lines as the advance rules see them. A line is made to order when it is a booked
 * service, or a product the catalog says is made to order or a service, unless the shopper chose
 * a ready size on it (`tailored: false`): that line is ready-made, as the database will record it.
 */
export function advanceLinesOfCart(
  cart: readonly CartItem[],
  madeToOrderIds: ReadonlySet<string>,
  categoryById: ReadonlyMap<string, string | null>,
): AdvanceLine[] {
  return cart.map((item) => ({
    amount: item.price * item.qty,
    madeToOrder:
      Boolean(item.booking) || (madeToOrderIds.has(item.product_id) && item.tailored !== false),
    productId: item.product_id,
    category: categoryById.get(item.product_id) ?? null,
  }));
}

/**
 * A gift order's message card as the advance rules see it: a ready-made line of no product, as
 * the database writes it (`apply_order_gift`). None when the card is free or not chosen.
 */
export function giftAdvanceLines(fee: number): AdvanceLine[] {
  return fee > 0 ? [{ amount: fee, madeToOrder: false, productId: null, category: null }] : [];
}
