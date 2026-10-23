import { CalendarDays } from "lucide-react";
import { confirmationEnd, type BookingConfirmation } from "@/lib/bookings/confirmation";
import { dayTitle, formatClockRange } from "@/lib/bookings/format";
import { bookingEvent } from "@/lib/bookings/add-to-calendar";
import { AddToCalendar } from "@/features/storefront-booking/components/AddToCalendar";

/**
 * The booked appointment on the thank-you page: day, time and reference, and a
 * way to put it in the shopper's own calendar once the store's time zone is known.
 */
export function AppointmentSummary({
  appointment,
  isAr,
  calendar,
}: {
  appointment: BookingConfirmation;
  isAr: boolean;
  /** The store's name and time zone, for the calendar event (none: no calendar buttons). */
  calendar?: { storeName: string; timezone: string } | null;
}) {
  const event = calendar
    ? bookingEvent({
        reference: appointment.ref,
        day: appointment.day,
        start: appointment.start,
        minutes: appointment.minutes,
        timezone: calendar.timezone,
        storeName: calendar.storeName,
        isAr,
      })
    : null;
  return (
    <div className="mx-auto mb-4 max-w-sm space-y-1 rounded-xl border border-border bg-muted/40 p-4 text-sm">
      <p className="flex items-center justify-center gap-1.5 font-semibold text-foreground">
        <CalendarDays className="size-4" aria-hidden="true" />
        {dayTitle(appointment.day, isAr)}
      </p>
      <p className="text-foreground">
        {formatClockRange(appointment.start, confirmationEnd(appointment), isAr)}
      </p>
      <p className="text-xs text-muted-foreground">
        {isAr ? "رقم الحجز" : "Booking reference"}: <span dir="ltr">{appointment.ref}</span>
      </p>
      {event && (
        <AddToCalendar event={event} reference={appointment.ref} isAr={isAr} className="pt-2" />
      )}
    </div>
  );
}
