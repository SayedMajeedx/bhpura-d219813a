/**
 * Whether an order was undone (cancelled, refunded, voided or failed): the stock engine's own
 * reading of an order, `order_inventory_desired_state(...) = 'released'` in the database. A
 * screen that asks "is this order cancelled?" reads this, so it agrees with what the database
 * releases and refuses. `tests/customer-pieces-after-migration.test.ts` runs both side by side.
 */
const RELEASED_STATUSES = ["cancelled", "canceled", "refunded", "voided", "failed"];
const FAILED_PAYMENTS = ["failed", "declined"];

export function orderReleased(
  status: string | null | undefined,
  paymentStatus: string | null | undefined,
): boolean {
  const st = (status ?? "").trim().toLowerCase();
  const pst = (paymentStatus ?? "").trim().toLowerCase();
  return RELEASED_STATUSES.includes(st) || FAILED_PAYMENTS.includes(pst);
}
