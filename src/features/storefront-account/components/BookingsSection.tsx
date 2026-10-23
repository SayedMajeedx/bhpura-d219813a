import { Link } from "@tanstack/react-router";
import { CalendarDays, Clock, FileText, Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatPrice, useStorefront } from "@/lib/storefront-context";
import { bookingPlaceText, dayTitle, formatClockRange, localTime } from "@/lib/bookings/format";
import { AddToCalendar } from "@/features/storefront-booking/components/AddToCalendar";
import {
  ownBookingBalance,
  ownBookingEvent,
  ownBookingServices,
  shopperBookingStatus,
  splitOwnBookings,
  type OwnBooking,
} from "@/features/storefront-account/lib/own-bookings";

const TONES = {
  success: "bg-success-subtle text-success",
  warning: "bg-warning-subtle text-warning",
  muted: "bg-muted text-muted-foreground",
  destructive: "bg-destructive-subtle text-destructive",
} as const;

/**
 * A shopper's bookings with the store: the ones still to come first (with a way
 * to put each in their calendar), then the rest. Each says when and where, what
 * was booked, what is paid and still to pay, and opens its invoice.
 */
export function BookingsSection({
  bookings,
  isLoading,
}: {
  bookings: readonly OwnBooking[] | undefined;
  isLoading: boolean;
}) {
  const { brand, lang, t } = useStorefront();
  const isAr = lang === "ar";

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center" role="status">
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">{t("جارٍ التحميل…", "Loading…")}</span>
      </div>
    );
  }

  const { upcoming, past } = splitOwnBookings(bookings ?? []);
  if (upcoming.length === 0 && past.length === 0) {
    return (
      <div className="space-y-3 py-8 text-center">
        <CalendarDays className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          {t("لا توجد حجوزات بعد.", "No bookings yet.")}
        </p>
        <Button asChild size="sm">
          <Link to="/$slug/book" params={{ slug: brand.slug }}>
            {t("احجز موعداً", "Book a date")}
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {upcoming.length > 0 && (
        <section className="space-y-3" aria-label={t("القادمة", "Coming up")}>
          <h3 className="text-sm font-semibold text-foreground">{t("القادمة", "Coming up")}</h3>
          {upcoming.map((booking) => (
            <OwnBookingCard key={booking.reference} booking={booking} isAr={isAr} upcoming />
          ))}
        </section>
      )}
      {past.length > 0 && (
        <section className="space-y-3" aria-label={t("السابقة", "Past")}>
          <h3 className="text-sm font-semibold text-foreground">{t("السابقة", "Past")}</h3>
          {past.map((booking) => (
            <OwnBookingCard key={booking.reference} booking={booking} isAr={isAr} />
          ))}
        </section>
      )}
    </div>
  );
}

function OwnBookingCard({
  booking,
  isAr,
  upcoming = false,
}: {
  booking: OwnBooking;
  isAr: boolean;
  upcoming?: boolean;
}) {
  const { brand, lang, t } = useStorefront();
  const status = shopperBookingStatus(booking.status, isAr);
  const place = bookingPlaceText(booking.location);
  const services = ownBookingServices(booking, isAr);
  const balance = ownBookingBalance(booking);
  const invoice = booking.invoice_token ? `/invoice/${booking.invoice_token}` : null;
  const event = upcoming
    ? ownBookingEvent(booking, {
        storeName: (isAr ? brand.name_ar : null) || brand.name_en || "",
        place,
        link: invoice ? `${window.location.origin}${invoice}` : null,
        isAr,
      })
    : null;

  return (
    <article className="space-y-3 rounded-xl border border-border bg-background p-4 text-sm">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <p className="font-semibold text-foreground">{dayTitle(booking.event_date, isAr)}</p>
          <p className="flex items-center gap-1 text-muted-foreground">
            <Clock className="size-3.5" aria-hidden="true" />
            {formatClockRange(
              localTime(booking.starts_at, booking.timezone),
              localTime(booking.ends_at, booking.timezone),
              isAr,
            )}
          </p>
        </div>
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", TONES[status.tone])}>
          {status.label}
        </span>
      </header>
      {services.length > 0 && (
        <p className="break-words text-foreground">{services.join(isAr ? "، " : ", ")}</p>
      )}
      {place && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 break-words">{place}</span>
        </p>
      )}
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>
          {t("رقم الحجز", "Reference")}: <span dir="ltr">{booking.reference}</span>
        </span>
        <span>
          {t("الإجمالي", "Total")}:{" "}
          <span dir="ltr">{formatPrice(Number(booking.total), booking.currency, lang)}</span>
        </span>
        {balance > 0 && booking.status !== "cancelled" && (
          <span className="text-warning">
            {t("المتبقي", "Still to pay")}:{" "}
            <span dir="ltr">{formatPrice(balance, booking.currency, lang)}</span>
          </span>
        )}
      </p>
      {(invoice || event) && (
        <div className="flex flex-wrap gap-2">
          {invoice && (
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <a href={invoice}>
                <FileText className="size-4" aria-hidden="true" />
                {t("الفاتورة", "Invoice")}
              </a>
            </Button>
          )}
          {event && (
            <AddToCalendar
              event={event}
              reference={booking.reference}
              isAr={isAr}
              className="justify-start"
            />
          )}
        </div>
      )}
    </article>
  );
}
