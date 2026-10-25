import { bookingInvoiceOf } from "@/features/bookings/lib/booking-invoice";

/**
 * The bookings that wait for the store: a customer's request to answer, and a day held for a
 * BenefitPay transfer whose receipt waits to be checked. The bookings page lists both; the
 * dashboard counts them. The dashboard once counted every hold, so a hold that ran out weeks ago
 * read "1 request waiting for your reply" while the bookings page showed nothing to answer.
 */
type Waiting = {
  status: string;
  orders?: Parameters<typeof bookingInvoiceOf>[0]["orders"];
};

export function waitingOnStore<T extends Waiting>(bookings: readonly T[]) {
  return {
    requests: bookings.filter((booking) => booking.status === "requested"),
    toVerify: bookings.filter(
      (booking) =>
        booking.status === "hold" && bookingInvoiceOf(booking)?.status === "pending_verification",
    ),
  };
}

/** How many bookings wait for the store's answer or check. */
export function waitingCount(bookings: readonly Waiting[]): number {
  const { requests, toVerify } = waitingOnStore(bookings);
  return requests.length + toVerify.length;
}
