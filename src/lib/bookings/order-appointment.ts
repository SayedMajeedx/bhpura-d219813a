import { bookingPlaceText, dayTitle, formatClockRange, localTime } from "@/lib/bookings/format";

/**
 * An order placed for a booking is an appointment (orders.fulfillment_method).
 * These are the pure pieces every screen that shows one shares: finding the
 * order's booking and wording it (day, time, place) for staff, customers and
 * the invoice.
 */

export type OrderBooking = {
  reference?: string | null;
  event_date: string;
  starts_at: string;
  ends_at: string;
  location?: unknown;
};

/** The first booking an order carries, or null (a delivery, pickup or digital order has none). */
export function bookingOfOrder(
  order: { bookings?: unknown } | null | undefined,
): OrderBooking | null {
  const rows = Array.isArray(order?.bookings) ? (order.bookings as OrderBooking[]) : [];
  return rows.find((row) => row?.event_date && row.starts_at && row.ends_at) ?? null;
}

export type AppointmentText = {
  reference: string;
  /** "Thursday 8 October" / "الخميس 8 أكتوبر". */
  day: string;
  /** "6:00 PM – 9:00 PM" / "6:00 م – 9:00 م". */
  time: string;
  place: string;
};

/** The booking worded in the reader's language, in the store's timezone. */
export function appointmentText(
  booking: OrderBooking,
  timezone: string,
  isAr: boolean,
): AppointmentText {
  return {
    reference: booking.reference ?? "",
    day: dayTitle(booking.event_date, isAr),
    time: formatClockRange(
      localTime(booking.starts_at, timezone),
      localTime(booking.ends_at, timezone),
      isAr,
    ),
    place: bookingPlaceText(booking.location),
  };
}

/** What an invoice calls how the order is fulfilled. */
export function fulfillmentMethodText(method: string | null | undefined, isAr: boolean): string {
  switch (method) {
    case "digital":
      return isAr ? "تسليم رقمي" : "Digital delivery";
    case "pickup":
      return isAr ? "استلام" : "Pickup";
    case "appointment":
      return isAr ? "موعد خدمة" : "Service appointment";
    default:
      return isAr ? "توصيل للمنزل" : "Home delivery";
  }
}
