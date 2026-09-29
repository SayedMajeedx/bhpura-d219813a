import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dayTitle, formatClock, localTime } from "@/lib/bookings/format";
import type { BookingsPage } from "@/features/bookings/hooks/use-bookings-page";

/**
 * Booking requests waiting for the store (a catalog store's "book via
 * WhatsApp", or ones staff noted to confirm later). A request takes no place
 * until it is confirmed; confirming checks the day still has one.
 */
export function BookingRequestsList({ page }: { page: BookingsPage }) {
  const { isAr, requests } = page;
  if (requests.length === 0) return null;

  return (
    <section className="space-y-2 rounded-2xl border border-warning bg-warning-subtle p-3 sm:p-4">
      <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
        <Inbox className="size-4 text-warning" aria-hidden="true" />
        {isAr ? `طلبات حجز بانتظارك (${requests.length})` : `Booking requests (${requests.length})`}
      </h2>
      <ul className="space-y-2">
        {requests.map((booking) => (
          <li
            key={booking.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-card p-2 text-xs"
          >
            <Button
              type="button"
              variant="ghost"
              className="h-auto min-w-0 flex-col items-start gap-0 whitespace-normal p-0 text-start text-xs font-normal hover:bg-transparent hover:underline"
              onClick={() => page.goToDay(booking.event_date)}
            >
              <span className="block font-semibold text-foreground">
                {dayTitle(booking.event_date, isAr)} ·{" "}
                <span dir="ltr">
                  {formatClock(localTime(booking.starts_at, page.rules.timezone), isAr)}
                </span>
              </span>
              <span className="block text-muted-foreground">
                {booking.customer_name || booking.customer_phone || booking.reference}
              </span>
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                className="h-8 text-xs"
                disabled={page.statusPending}
                onClick={() => page.setStatus({ booking, status: "confirmed" })}
              >
                {isAr ? "تأكيد" : "Confirm"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                disabled={page.statusPending}
                onClick={() => page.setStatus({ booking, status: "cancelled" })}
              >
                {isAr ? "رفض" : "Decline"}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
