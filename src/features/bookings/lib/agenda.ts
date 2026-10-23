import { addDays } from "@/lib/bookings/rules";
import { shownStatus } from "@/features/bookings/lib/booking-actions";
import { bookingInvoiceOf } from "@/features/bookings/lib/booking-invoice";

/**
 * The bookings page's agenda: today and the days after it as a list, the way a
 * services business plans its week. A day lists what takes or asks for a place
 * (confirmed, waiting requests, holds still running) and what was done today;
 * nothing cancelled or run out. Tomorrow's confirmed bookings are the ones to
 * remind (a person sends the WhatsApp message; each is remembered once sent).
 */

/** How many days the agenda shows, today included. */
export const AGENDA_DAYS = 7;

type AgendaBooking = {
  id: string;
  status: string | null;
  event_date: string;
  starts_at: string;
  hold_expires_at?: string | null;
  customer_phone?: string | null;
  orders?: Parameters<typeof bookingInvoiceOf>[0]["orders"];
};

export type AgendaDay<T> = { day: string; offset: number; bookings: T[] };

/** The agenda's last day: `AGENDA_DAYS` days from today, today included. */
export const agendaEnd = (today: string) => addDays(today, AGENDA_DAYS - 1);

/** Whether a booking belongs on the agenda. */
export function onAgenda(booking: AgendaBooking, now: Date = new Date()): boolean {
  const status = shownStatus(booking, now);
  return (
    status === "confirmed" || status === "requested" || status === "hold" || status === "completed"
  );
}

/** Today and the next days, each with its bookings in start order; a day with none is kept (it is free). */
export function agendaDays<T extends AgendaBooking>(
  bookings: readonly T[],
  today: string,
  now: Date = new Date(),
): AgendaDay<T>[] {
  return Array.from({ length: AGENDA_DAYS }, (_, offset) => {
    const day = addDays(today, offset);
    return {
      day,
      offset,
      bookings: bookings
        .filter((booking) => booking.event_date === day && onAgenda(booking, now))
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
    };
  });
}

/** Whether a customer can be reminded of a booking: confirmed, still to come, with a number to reach. */
export function canRemind(booking: AgendaBooking, today: string, now: Date = new Date()): boolean {
  return (
    shownStatus(booking, now) === "confirmed" &&
    booking.event_date > today &&
    Boolean(booking.customer_phone?.trim())
  );
}

/** Whether a booking is one to remind today: confirmed, tomorrow, with a number to reach, not yet reminded. */
export function remindToday(
  booking: AgendaBooking,
  today: string,
  /** The bookings already reminded (by id). */
  reminded: { has(bookingId: string): boolean },
  now: Date = new Date(),
): boolean {
  return (
    booking.event_date === addDays(today, 1) &&
    canRemind(booking, today, now) &&
    !reminded.has(booking.id)
  );
}

/** What the customer still owes on a booking (its order's total less what was paid), 0 when none. */
export function bookingBalance(booking: Pick<AgendaBooking, "orders">): number {
  const invoice = bookingInvoiceOf(booking);
  if (!invoice) return 0;
  return Math.max(0, Math.round((invoice.total - invoice.paid) * 1000) / 1000);
}
