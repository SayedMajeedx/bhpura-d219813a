import { nextStatuses, type BookingStatus } from "@/lib/bookings/rules";
import { bookingInvoiceOf } from "@/features/bookings/lib/booking-invoice";
import { arNounOblique } from "@/lib/arabic-count";

/**
 * What staff can do with a booking on its card, and what each step writes.
 *
 * A booking and its order are one sale (create_booking_order). The order is
 * what reports, loyalty points, the review request and the customer's balance
 * read, so a booking is finished through its order: the order completes (the
 * balance collected with it, as the order page does) and the booking follows
 * (sync_bookings_with_order). Marking the booking alone done left its order
 * open for good.
 */

type CardBooking = {
  status: string | null;
  starts_at?: string | null;
  hold_expires_at?: string | null;
  late_payment_slot_taken_at?: string | null;
  orders?: Parameters<typeof bookingInvoiceOf>[0]["orders"];
};

const round3 = (value: number) => Math.round(value * 1000) / 1000;

/**
 * The state a booking is in for staff. A hold whose time ran out no longer
 * takes its day (the calendar and the database read it so), so it reads as
 * expired, not as "awaiting payment".
 */
export function shownStatus(booking: CardBooking, now: Date = new Date()): BookingStatus {
  const status = (booking.status ?? "confirmed") as BookingStatus;
  if (
    status === "hold" &&
    booking.hold_expires_at &&
    new Date(booking.hold_expires_at).getTime() <= now.getTime()
  ) {
    return "expired";
  }
  return status;
}

/**
 * Whether a booking was paid after its hold ran out, when its day had been taken meanwhile: the
 * database recorded the payment and did not confirm it (migration 20261026100000). It waits for
 * staff to move it to a free time or cancel it and return the money.
 */
export function slotTaken(booking: CardBooking): boolean {
  return booking.status === "expired" && Boolean(booking.late_payment_slot_taken_at);
}

/**
 * How many whole hours ago a held booking's hold ran out while its transfer receipt still waits
 * (0 within the first hour), or null while the hold runs or nothing waits. Approving it then
 * confirms the booking only if its day is still free.
 */
export function lateTransferHours(booking: CardBooking, now: Date = new Date()): number | null {
  if (booking.status !== "hold" && booking.status !== "expired") return null;
  if (bookingInvoiceOf(booking)?.status !== "pending_verification") return null;
  if (!booking.hold_expires_at) return null;
  const since = now.getTime() - new Date(booking.hold_expires_at).getTime();
  return since >= 0 ? Math.floor(since / 3_600_000) : null;
}

/**
 * What staff read before approving a transfer whose booking's hold ran out `hours` ago
 * (`lateTransferHours`): approving still records the payment, and confirms the booking only
 * while its day is free.
 */
export function holdRanOutText(hours: number, isAr: boolean): string {
  if (isAr) {
    const since = hours < 1 ? "أقل من ساعة" : arNounOblique(hours, "hour");
    return `انتهت مهلة الحجز منذ ${since}. إن حجز عميل آخر الموعد في هذه الأثناء، يُسجَّل الدفع عند اعتماده ولا يُؤكَّد الحجز.`;
  }
  const since = hours < 1 ? "less than an hour" : `${hours} ${hours === 1 ? "hour" : "hours"}`;
  return `The hold ran out ${since} ago. If another customer has booked the date meanwhile, approving records the payment and does not confirm the booking.`;
}

/** Whether a booking is listed on its day: not one that ran out, unless a transfer receipt for it waits or it was paid. */
export function listedOnDay(booking: CardBooking, now: Date = new Date()): boolean {
  if (shownStatus(booking, now) !== "expired") return true;
  return bookingInvoiceOf(booking)?.status === "pending_verification" || slotTaken(booking);
}

/**
 * The steps a card offers. A booking is done only once its time has come, as
 * its order's "Service done" is; a hold that ran out can still be confirmed
 * (paid late) or let go.
 */
export function cardSteps(booking: CardBooking, now: Date = new Date()): BookingStatus[] {
  // Paid, and its day taken: it is moved (its own button) or cancelled, never confirmed over the other.
  if (slotTaken(booking)) return ["cancelled"];
  const status = shownStatus(booking, now);
  const steps =
    status === "expired" && booking.status === "hold"
      ? (["confirmed", "cancelled"] as BookingStatus[])
      : nextStatuses(status);
  const started = !booking.starts_at || new Date(booking.starts_at).getTime() <= now.getTime();
  return steps.filter((step) => step !== "completed" || started);
}

/** How "Mark done" finishes a booking. */
export type DonePlan =
  /** Complete its order; `collect` is what the customer still owes, recorded as collected. */
  | { kind: "order"; orderId: string; collect: number; currency: string }
  /** A transfer receipt waits for the store's check: approve the payment first. */
  | { kind: "verify_first"; orderId: string }
  /** No order to complete (an older booking): the booking alone. */
  | { kind: "booking" };

export function donePlan(booking: CardBooking): DonePlan {
  const invoice = bookingInvoiceOf(booking);
  if (!invoice) return { kind: "booking" };
  if (invoice.status === "pending_verification") {
    return { kind: "verify_first", orderId: invoice.orderId };
  }
  // An order already completed, cancelled or refunded is not completed again.
  if (["completed", "cancelled", "canceled", "refunded", "returned"].includes(invoice.status)) {
    return { kind: "booking" };
  }
  return {
    kind: "order",
    orderId: invoice.orderId,
    collect: Math.max(0, round3(invoice.total - invoice.paid)),
    currency: invoice.currency,
  };
}

/** What cancelling a booking means for the money: what was paid stays paid until the store returns it. */
export function cancelMoney(booking: CardBooking): {
  hasOrder: boolean;
  paid: number;
  currency: string | null;
} {
  const invoice = bookingInvoiceOf(booking);
  return {
    hasOrder: Boolean(invoice),
    paid: invoice ? round3(invoice.paid) : 0,
    currency: invoice?.currency ?? null,
  };
}
