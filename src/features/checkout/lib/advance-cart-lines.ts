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
