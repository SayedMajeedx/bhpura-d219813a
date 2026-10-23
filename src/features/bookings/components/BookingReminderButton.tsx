import { BellRing, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addDays } from "@/lib/bookings/rules";
import { bookingPlaceText, dayTitle, formatClockRange, localTime } from "@/lib/bookings/format";
import type { Booking } from "@/lib/data/bookings";
import { bookingInvoiceOf, invoiceLink } from "@/features/bookings/lib/booking-invoice";
import { bookingBalance, canRemind } from "@/features/bookings/lib/agenda";
import { bookingReminderMessage, customerChatLink } from "@/features/bookings/lib/booking-messages";
import type { BookingsPage } from "@/features/bookings/hooks/use-bookings-page";

/**
 * Reminds a customer of a booking still to come on WhatsApp: the chat opens with
 * the message written (when, where, what is still to pay, the invoice) and a
 * person sends it. Opening it is recorded, so the booking reads "reminded" and is
 * not offered again; it can still be sent again.
 */
export function BookingReminderButton({ page, booking }: { page: BookingsPage; booking: Booking }) {
  const { isAr, brand, today } = page;
  if (!canRemind(booking, today)) return null;
  const timezone = page.rules.timezone;
  const invoice = bookingInvoiceOf(booking);
  const text = bookingReminderMessage({
    isAr,
    brandName: (isAr ? brand.name_ar : null) || brand.name_en || "",
    customerName: booking.customer_name,
    reference: booking.reference,
    dayLabel: dayTitle(booking.event_date, isAr),
    timeLabel: formatClockRange(
      localTime(booking.starts_at, timezone),
      localTime(booking.ends_at, timezone),
      isAr,
    ),
    place: bookingPlaceText(booking.location) || null,
    balance: bookingBalance(booking),
    currency: invoice?.currency ?? page.currency,
    tomorrow: booking.event_date === addDays(today, 1),
    link: invoice ? invoiceLink(window.location.origin, invoice.token) : null,
  });
  const chat = customerChatLink(booking.customer_phone, text);
  if (!chat) return null;
  const sentAt = page.reminded.get(booking.id);

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        asChild
        type="button"
        size="sm"
        variant={sentAt ? "outline" : "default"}
        className="h-8 gap-1.5 text-xs"
      >
        <a
          href={chat}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => page.recordReminder(booking)}
        >
          <BellRing className="size-3.5" aria-hidden="true" />
          {sentAt
            ? isAr
              ? "تذكير مرة أخرى"
              : "Remind again"
            : isAr
              ? "تذكير بالموعد"
              : "Remind of the date"}
        </a>
      </Button>
      {sentAt && (
        <span className="inline-flex items-center gap-1 text-xs text-success">
          <Check className="size-3.5" aria-hidden="true" />
          {isAr ? "أُرسل التذكير" : "Reminded"}
        </span>
      )}
    </span>
  );
}
