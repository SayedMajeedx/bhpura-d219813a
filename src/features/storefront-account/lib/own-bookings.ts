import { localTime } from "@/lib/bookings/format";
import { bookingEvent, type CalendarEvent } from "@/lib/bookings/add-to-calendar";
import type { OwnBooking } from "@/lib/data/customers";

export type { OwnBooking };

/**
 * A shopper's bookings on their account (storefront_my_bookings, migration
 * 20261023120000): what each state reads as to a customer, which are still to
 * come, what is still to pay, and the event for their calendar.
 */

export type ShopperBookingStatus = {
  label: string;
  tone: "success" | "warning" | "muted" | "destructive";
};

/** A booking's state in a customer's words. */
export function shopperBookingStatus(status: string, isAr: boolean): ShopperBookingStatus {
  switch (status) {
    case "confirmed":
      return { label: isAr ? "مؤكد" : "Confirmed", tone: "success" };
    case "requested":
      return { label: isAr ? "بانتظار تأكيد المتجر" : "Waiting for the store", tone: "warning" };
    case "hold":
      return { label: isAr ? "قيد التحقق من الدفع" : "Payment being checked", tone: "warning" };
    case "completed":
      return { label: isAr ? "تم" : "Done", tone: "muted" };
    default:
      return { label: isAr ? "ملغي" : "Cancelled", tone: "destructive" };
  }
}

/** Bookings still to come (soonest first) and the rest (latest first). */
export function splitOwnBookings<T extends Pick<OwnBooking, "status" | "starts_at" | "ends_at">>(
  bookings: readonly T[],
  now: Date = new Date(),
): { upcoming: T[]; past: T[] } {
  const ahead = (b: T) =>
    b.status !== "cancelled" && b.status !== "completed" && Date.parse(b.ends_at) > now.getTime();
  return {
    upcoming: bookings.filter(ahead).sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
    past: bookings.filter((b) => !ahead(b)).sort((a, b) => b.starts_at.localeCompare(a.starts_at)),
  };
}

/** What is still to pay on a booking (0 when nothing). */
export function ownBookingBalance(booking: Pick<OwnBooking, "total" | "paid">): number {
  return Math.max(0, Math.round((Number(booking.total) - Number(booking.paid)) * 1000) / 1000);
}

/** The booked services' names in the reader's language, "Photo booth × 2". */
export function ownBookingServices(booking: Pick<OwnBooking, "services">, isAr: boolean): string[] {
  return booking.services
    .map((s) => {
      const name = (isAr ? s.name_ar || s.name_en : s.name_en || s.name_ar) ?? "";
      return name && s.quantity > 1 ? `${name} × ${s.quantity}` : name;
    })
    .filter(Boolean);
}

/** The booking as an event for the shopper's calendar. */
export function ownBookingEvent(
  booking: OwnBooking,
  input: { storeName: string; place: string; link: string | null; isAr: boolean },
): CalendarEvent {
  return bookingEvent({
    reference: booking.reference,
    day: booking.event_date,
    start: localTime(booking.starts_at, booking.timezone),
    minutes: Math.round((Date.parse(booking.ends_at) - Date.parse(booking.starts_at)) / 60_000),
    timezone: booking.timezone,
    storeName: input.storeName,
    services: ownBookingServices(booking, input.isAr),
    place: input.place || null,
    link: input.link,
    isAr: input.isAr,
  });
}
