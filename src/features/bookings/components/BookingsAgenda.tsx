import { useState } from "react";
import { BellRing, CalendarDays, Clock, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { arCount } from "@/lib/arabic-count";
import type { Booking } from "@/lib/data/bookings";
import {
  BOOKING_STATUS_TEXT,
  bookingPlaceText,
  dayTitle,
  formatClockRange,
  localTime,
} from "@/lib/bookings/format";
import { shownStatus } from "@/features/bookings/lib/booking-actions";
import { agendaDays, bookingBalance, remindToday } from "@/features/bookings/lib/agenda";
import { BookingReminderButton } from "@/features/bookings/components/BookingReminderButton";
import { BookingMoveDialog } from "@/features/bookings/components/BookingMoveDialog";
import type { BookingsPage } from "@/features/bookings/hooks/use-bookings-page";

/**
 * Today and the next six days as a list: what is booked when, for whom, where,
 * and what is still to pay, with the reminders to send for tomorrow first. A
 * day opens in the calendar for everything else (confirm, cancel, invoice).
 */
export function BookingsAgenda({
  page,
  onOpenDay,
}: {
  page: BookingsPage;
  onOpenDay: (day: string) => void;
}) {
  const { isAr, today } = page;
  const days = agendaDays(page.agendaBookings, today);
  const toRemind = days
    .flatMap((day) => day.bookings)
    .filter((booking) => remindToday(booking, today, page.reminded)).length;
  const total = days.reduce((sum, day) => sum + day.bookings.length, 0);

  if (page.agendaLoading) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground" role="status">
        {isAr ? "جارٍ التحميل…" : "Loading…"}
      </p>
    );
  }

  return (
    <section className="space-y-3" aria-label={isAr ? "الأيام القادمة" : "The days ahead"}>
      {toRemind > 0 && (
        <p className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm text-foreground">
          <BellRing className="size-4 shrink-0 text-primary" aria-hidden="true" />
          {isAr
            ? `${arCount(toRemind, { one: "حجز واحد", two: "حجزان", few: "حجوزات", many: "حجزاً" })} غداً بانتظار التذكير.`
            : toRemind === 1
              ? "1 booking tomorrow still to remind."
              : `${toRemind} bookings tomorrow still to remind.`}
        </p>
      )}
      {total === 0 && (
        <p className="rounded-xl border border-border bg-card p-4 text-center text-sm text-muted-foreground">
          {isAr ? "لا حجوزات في الأيام السبعة القادمة." : "Nothing booked in the next 7 days."}
        </p>
      )}
      <ol className="space-y-3">
        {days.map(({ day, offset, bookings }) => (
          <li key={day} className="rounded-2xl border border-border bg-card p-3 sm:p-4">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-base font-bold text-foreground">
                {offset === 0
                  ? isAr
                    ? "اليوم"
                    : "Today"
                  : offset === 1
                    ? isAr
                      ? "غداً"
                      : "Tomorrow"
                    : null}
                {offset < 2 && <span className="text-muted-foreground"> · </span>}
                <span className={offset < 2 ? "font-normal text-muted-foreground" : undefined}>
                  {dayTitle(day, isAr)}
                </span>
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => onOpenDay(day)}
              >
                <CalendarDays className="size-3.5" aria-hidden="true" />
                {isAr ? "فتح اليوم" : "Open day"}
              </Button>
            </header>
            {bookings.length === 0 ? (
              <p className="pt-1 text-xs text-muted-foreground">{isAr ? "متاح" : "Free"}</p>
            ) : (
              <ul className="mt-2 divide-y divide-border">
                {bookings.map((booking) => (
                  <AgendaRow key={booking.id} page={page} booking={booking} />
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function AgendaRow({ page, booking }: { page: BookingsPage; booking: Booking }) {
  const { isAr, rules } = page;
  const [moving, setMoving] = useState(false);
  const status = shownStatus(booking);
  const text = BOOKING_STATUS_TEXT[status];
  const balance = bookingBalance(booking);
  const place = bookingPlaceText(booking.location);
  const services = (booking.booking_items ?? [])
    .filter((item) => !item.parent_item_id)
    .map((item) => (isAr ? item.name_ar || item.name_en : item.name_en || item.name_ar))
    .filter(Boolean)
    .join(isAr ? "، " : ", ");
  const movable = status === "confirmed" || status === "requested";

  return (
    <li className="flex flex-col gap-2 py-3 first:pt-1 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1 text-sm">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="flex items-center gap-1 font-semibold text-foreground">
            <Clock className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <span dir={isAr ? "rtl" : "ltr"}>
              {formatClockRange(
                localTime(booking.starts_at, rules.timezone),
                localTime(booking.ends_at, rules.timezone),
                isAr,
              )}
            </span>
          </span>
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", text.tone)}>
            {isAr ? text.ar : text.en}
          </span>
        </p>
        <p className="line-clamp-2 break-words text-foreground">
          {booking.customer_name || booking.customer_phone || booking.reference}
          {services && <span className="text-muted-foreground"> · {services}</span>}
        </p>
        {place && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 break-words">{place}</span>
          </p>
        )}
        {balance > 0 && (
          <p className="text-xs text-warning">
            {isAr ? "المتبقي للدفع: " : "Still to pay: "}
            <span dir="ltr">
              {formatMoney(balance, booking.orders?.currency ?? page.currency, isAr ? "ar" : "en")}
            </span>
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <BookingReminderButton page={page} booking={booking} />
        {movable && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={() => setMoving(true)}
          >
            {isAr ? "نقل" : "Move"}
          </Button>
        )}
      </div>
      {moving && (
        <BookingMoveDialog
          page={page}
          booking={booking}
          open
          onOpenChange={(open) => !open && setMoving(false)}
        />
      )}
    </li>
  );
}
