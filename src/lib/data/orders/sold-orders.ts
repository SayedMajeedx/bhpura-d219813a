/**
 * Which orders count as sold, for the figures the app works out itself (cost of goods on the
 * expenses page, the inventory's sales rate).
 *
 * The two used to be lists of the statuses that count ("confirmed, paid, shipped, completed"),
 * and the lists did not know every status an order passes through: an order being packed, at
 * the tailor or ready for pickup dropped out of the figures while it was there, and one that
 * was completed with its status left at "packing" never came back. An order counts unless it
 * was never placed, is still waiting to be confirmed, or was undone: the same reading the
 * database's reports use (`rpc_reporting_*`: paid and not cancelled).
 */
export const NOT_SOLD_ORDER_STATUSES = [
  "draft",
  "pending",
  "pending_verification",
  "benefit_rejected",
  "cancelled",
  "canceled",
  "refunded",
  "voided",
  "failed",
  "returned",
  "archived_historical",
] as const;

/** The filter for a PostgREST `not.in`: `.not("status", "in", NOT_SOLD_ORDER_FILTER)`. */
export const NOT_SOLD_ORDER_FILTER = `(${NOT_SOLD_ORDER_STATUSES.join(",")})`;

/** Whether an order with this status counts as sold. An order with no status does not. */
export function countsAsSold(status: string | null | undefined): boolean {
  const value = (status ?? "").trim().toLowerCase();
  return value !== "" && !(NOT_SOLD_ORDER_STATUSES as readonly string[]).includes(value);
}
