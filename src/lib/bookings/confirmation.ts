import type { CartBooking } from "@/lib/bookings/cart";
import { localTime } from "@/lib/bookings/format";
import { minutesOf, timeOf } from "@/lib/bookings/rules";

/**
 * The appointment the thank-you page shows after a booking's checkout. The
 * page never reads the order (a shopper can't, bug #19), so the checkout and
 * the card gateway's redirect put the appointment in its address, as they do
 * the fulfillment method. Editing the address only changes what that shopper
 * reads, never the booking.
 */
export type BookingConfirmation = {
  /** The booking reference, e.g. "BK-7Q2M9X". */
  ref: string;
  /** The day, "YYYY-MM-DD". */
  day: string;
  /** The local start time, "HH:MM". */
  start: string;
  minutes: number;
};

/** From the booking the cart was finishing. */
export function confirmationFromCart(booking: CartBooking): BookingConfirmation {
  return {
    ref: booking.reference,
    day: booking.day,
    start: booking.start,
    minutes: booking.durationMinutes,
  };
}

/** From a booking row (the server's redirect), in the store's timezone. */
export function confirmationFromRow(
  row: { reference: string; event_date: string; starts_at: string; ends_at: string },
  timezone: string,
): BookingConfirmation {
  const minutes = Math.round(
    (new Date(row.ends_at).getTime() - new Date(row.starts_at).getTime()) / 60_000,
  );
  return {
    ref: row.reference,
    day: row.event_date,
    start: localTime(row.starts_at, timezone),
    minutes,
  };
}

/** The address's search values for a confirmation. */
export function confirmationSearch(confirmation: BookingConfirmation): Record<string, string> {
  return {
    ref: confirmation.ref,
    day: confirmation.day,
    start: confirmation.start,
    minutes: String(confirmation.minutes),
  };
}

const REF = /^[A-Z0-9-]{3,32}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A confirmation read back from the address, or null when it is incomplete or malformed. */
export function parseConfirmation(search: Record<string, unknown>): BookingConfirmation | null {
  const ref = typeof search.ref === "string" ? search.ref : "";
  const day = typeof search.day === "string" ? search.day : "";
  const start = typeof search.start === "string" ? search.start : "";
  const minutes = Number(search.minutes);
  if (!REF.test(ref) || !DAY.test(day) || !TIME.test(start)) return null;
  if (!Number.isInteger(minutes) || minutes < 15 || minutes > 1440) return null;
  if (Number.isNaN(new Date(`${day}T00:00:00Z`).getTime())) return null;
  return { ref, day, start, minutes };
}

/** Where the appointment ends, "HH:MM" (wrapping past midnight). */
export function confirmationEnd(confirmation: BookingConfirmation): string {
  return timeOf(minutesOf(confirmation.start) + confirmation.minutes);
}
