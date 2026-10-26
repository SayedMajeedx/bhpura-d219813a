import { bookingInvoiceOf } from "@/features/bookings/lib/booking-invoice";
import { slotTaken } from "@/features/bookings/lib/booking-actions";

/**
 * The bookings that wait for the store: a customer's request to answer, a day held for a
 * BenefitPay transfer whose receipt waits to be checked, and a booking paid after its hold ran
 * out whose day was taken meanwhile. The bookings page lists both; the
 * dashboard counts them. The dashboard once counted every hold, so a hold that ran out weeks ago
 * read "1 request waiting for your reply" while the bookings page showed nothing to answer.
 */
type Waiting = {
  status: string;
  late_payment_slot_taken_at?: string | null;
  orders?: Parameters<typeof bookingInvoiceOf>[0]["orders"];
};

export function waitingOnStore<T extends Waiting>(bookings: readonly T[]) {
  return {
    requests: bookings.filter((booking) => booking.status === "requested"),
    toVerify: bookings.filter(
      (booking) =>
        booking.status === "hold" && bookingInvoiceOf(booking)?.status === "pending_verification",
    ),
    // Paid after the hold ran out, its day taken meanwhile: to move or to cancel and refund.
    slotTaken: bookings.filter((booking) => slotTaken(booking)),
  };
}

/** How many bookings wait for the store's answer or check. */
export function waitingCount(bookings: readonly Waiting[]): number {
  const { requests, toVerify, slotTaken: bumped } = waitingOnStore(bookings);
  return requests.length + toVerify.length + bumped.length;
}
