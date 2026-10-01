import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarDays, Clock, MapPin } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { bookingsQueries } from "@/lib/data/bookings";
import type { BookingStatus } from "@/lib/bookings/rules";
import {
  BOOKING_STATUS_TEXT,
  bookingPlaceText,
  dayTitle,
  formatClock,
  localTime,
} from "@/lib/bookings/format";

/**
 * The appointment an order was placed for (a services store's checkout): its
 * day, time, place and status, with a link to the bookings calendar. Shows
 * nothing for an order without a booking.
 */
export function OrderBookingCard({
  brandId,
  slug,
  orderId,
  isAr,
  currency,
}: {
  brandId: string;
  slug: string;
  orderId: string;
  isAr: boolean;
  currency: string;
}) {
  const bookingQ = useQuery(bookingsQueries.forOrder(brandId, orderId));
  const settingsQ = useQuery({ ...bookingsQueries.settings(brandId), enabled: !!bookingQ.data });
  const booking = bookingQ.data;
  if (!booking) return null;

  const timezone = settingsQ.data?.timezone ?? "Asia/Bahrain";
  const status = (booking.status as BookingStatus) ?? "confirmed";
  const statusText = BOOKING_STATUS_TEXT[status] ?? BOOKING_STATUS_TEXT.confirmed;
  const place = bookingPlaceText(booking.location);
  const travelFee = Number(booking.travel_fee ?? 0);
  const deposit = Number(booking.deposit_amount ?? 0);

  return (
    <Card
      className="space-y-3 border-primary/30 bg-primary/5 p-4"
      aria-label={isAr ? "الموعد" : "Appointment"}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-bold text-foreground">
            <CalendarDays className="size-4 text-primary" aria-hidden="true" />
            {isAr ? "الموعد" : "Appointment"}
          </p>
          <p className="text-xs text-muted-foreground" dir="ltr">
            {booking.reference}
          </p>
        </div>
        <span
          className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", statusText.tone)}
        >
          {isAr ? statusText.ar : statusText.en}
        </span>
      </header>

      <div className="space-y-1.5 text-sm text-foreground">
        <p className="font-semibold">{dayTitle(booking.event_date, isAr)}</p>
        <p className="flex items-center gap-1.5">
          <Clock className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <span dir="ltr">
            {formatClock(localTime(booking.starts_at, timezone), isAr)} –{" "}
            {formatClock(localTime(booking.ends_at, timezone), isAr)}
          </span>
        </p>
        {place && (
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 break-words">{place}</span>
          </p>
        )}
      </div>

      {(travelFee > 0 || deposit > 0) && (
        <dl className="space-y-1 border-t border-border pt-2 text-xs">
          {travelFee > 0 && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{isAr ? "رسوم التنقل" : "Travel fee"}</dt>
              <dd dir="ltr">{formatMoney(travelFee, currency)}</dd>
            </div>
          )}
          {deposit > 0 && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{isAr ? "العربون" : "Deposit"}</dt>
              <dd dir="ltr">{formatMoney(deposit, currency)}</dd>
            </div>
          )}
        </dl>
      )}

      {booking.status === "cancelled" && booking.cancel_reason && (
        <p className="text-xs text-destructive">{booking.cancel_reason}</p>
      )}

      <Link
        to="/admin/b/$slug/bookings"
        params={{ slug }}
        className="inline-flex text-xs font-semibold text-primary hover:underline"
      >
        {isAr ? "فتح في تقويم الحجوزات ←" : "Open in the bookings calendar →"}
      </Link>
    </Card>
  );
}
