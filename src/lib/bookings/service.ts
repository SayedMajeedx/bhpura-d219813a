/**
 * A service in a bookings store is sold only with a booking: its page offers
 * "Book" and no cart buttons, and the database refuses a storefront order
 * that carries a service without one (order_item_service_needs_booking).
 * A product in the same store keeps its cart buttons.
 */
export function soldOnlyByBooking(
  product: { item_kind?: string | null } | null | undefined,
  modules: { bookings?: boolean } | null | undefined,
): boolean {
  return Boolean(modules?.bookings) && product?.item_kind === "service";
}
