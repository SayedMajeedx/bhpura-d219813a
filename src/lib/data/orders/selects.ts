/**
 * Column lists for admin order screens. One list per use, shared by every
 * screen that shows that use, so a cache entry always holds the same shape.
 * Each list must match its row type in `types.ts`.
 */

/** The orders queue (office and courier). Type: `OrderListRow`. */
export const ORDER_LIST_SELECT = "*, customers(*), order_items(*)";

/** The order editor, with the delivery address the order points at. Type: `OrderDetail`. */
export const ORDER_DETAIL_SELECT =
  "*, customers(*), order_items(*), shipping_address:customer_addresses!orders_shipping_address_id_fkey(*)";
