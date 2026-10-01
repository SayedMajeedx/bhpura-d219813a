import { CalendarDays } from "lucide-react";
import { confirmationEnd, type BookingConfirmation } from "@/lib/bookings/confirmation";
import { dayTitle, formatClockRange } from "@/lib/bookings/format";

/** The booked appointment on the thank-you page: day, time and reference. */
export function AppointmentSummary({
  appointment,
  isAr,
}: {
  appointment: BookingConfirmation;
  isAr: boolean;
}) {
  return (
    <div className="mx-auto mb-4 max-w-xs space-y-1 rounded-xl border border-border bg-muted/40 p-4 text-sm">
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
    </div>
  );
}
