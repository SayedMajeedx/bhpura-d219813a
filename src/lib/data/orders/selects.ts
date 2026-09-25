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

/**
 * Finance views (dashboard KPIs, P&L and cash-flow reports): money, status,
 * reconciliation and the cost snapshot of every line. Type: `OrderFinanceRow`.
 */
export const ORDER_FINANCE_SELECT =
  "id, invoice_number, created_at, currency, total, status, fulfillment_status, payment_status, payment_method, reconciliation_status, customer_id, customer_name_snapshot, customer_email_snapshot, customer_phone_snapshot, customers(name), order_items(id, description, product_id, variant_id, quantity, unit_price, unit_cost, line_total, packaging_cost_snapshot)";

/** The dashboard's latest-orders feed. Type: `OrderRecentRow`. */
export const ORDER_RECENT_SELECT =
  "id, invoice_number, created_at, currency, total, status, fulfillment_status, fulfillment_method, payment_status, customer_name_snapshot, customer_email_snapshot, customer_phone_snapshot, customers(name)";

/** The cash-flow tab's latest orders to reconcile. Type: `OrderReconciliationRow`. */
export const ORDER_RECONCILIATION_SELECT =
  "id, invoice_number, created_at, total, status, payment_status, payment_method, reconciliation_status, customer_name_snapshot, customers(name)";

/** Cost of goods sold per order line, for the expenses page. Type: `OrderCogsRow`. */
export const ORDER_COGS_SELECT =
  "id, invoice_number, created_at, currency, total, payment_method, status, fulfillment_status, order_items(id, description, quantity, unit_price, unit_cost, line_total, variant_id, product_id, packaging_cost_snapshot)";
