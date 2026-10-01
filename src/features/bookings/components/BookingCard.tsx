import { Clock, Mail, MapPin, Phone, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { nextStatuses, type BookingStatus } from "@/lib/bookings/rules";
import type { Booking } from "@/lib/data/bookings";
import { BookingDiscountEditor } from "@/features/bookings/components/BookingDiscountEditor";
import { BookingInvoiceBlock } from "@/features/bookings/components/BookingInvoiceBlock";
import type { BookingsPage } from "@/features/bookings/hooks/use-bookings-page";
import {
  BOOKING_STATUS_TEXT,
  bookingPlaceText,
  formatClockRange,
  localTime,
} from "@/lib/bookings/format";

/** The action button for moving a booking from `from` to `to`. */
function actionText(from: BookingStatus, to: BookingStatus, isAr: boolean): string {
  if (to === "confirmed") {
    if (from === "requested") return isAr ? "تأكيد الحجز" : "Confirm";
    if (from === "cancelled") return isAr ? "إعادة الحجز" : "Reinstate";
    return isAr ? "إعادة فتح" : "Reopen";
  }
  if (to === "cancelled")
    return from === "requested" ? (isAr ? "رفض" : "Decline") : isAr ? "إلغاء" : "Cancel";
  return isAr ? "تم التنفيذ" : "Mark done";
}

const SOURCE_TEXT: Record<string, { ar: string; en: string }> = {
  storefront: { ar: "من المتجر", en: "From the store" },
  whatsapp: { ar: "واتساب", en: "WhatsApp" },
  admin: { ar: "أضافه الفريق", en: "Added by staff" },
};

export function BookingCard({
  page,
  booking,
  isAr,
  currency,
  timezone,
  busy,
  onStatus,
}: {
  page: BookingsPage;
  booking: Booking;
  isAr: boolean;
  currency: string;
  timezone: string;
  busy: boolean;
  onStatus: (status: BookingStatus) => void;
}) {
  const status = (booking.status as BookingStatus) ?? "confirmed";
  const text = BOOKING_STATUS_TEXT[status] ?? BOOKING_STATUS_TEXT.confirmed;
  const start = localTime(booking.starts_at, timezone);
  const end = localTime(booking.ends_at, timezone);
  const place = bookingPlaceText(booking.location);
  const items = booking.booking_items ?? [];

  return (
    <article className="space-y-2 rounded-xl border border-border bg-card p-3 text-sm">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-semibold text-foreground">
            <Clock className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <span dir={isAr ? "rtl" : "ltr"}>{formatClockRange(start, end, isAr)}</span>
          </p>
          <p className="text-xs text-muted-foreground" dir="ltr">
            {booking.reference}
          </p>
        </div>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", text.tone)}>
          {isAr ? text.ar : text.en}
        </span>
      </header>

      {(booking.customer_name || booking.customer_phone) && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground">
          {booking.customer_name && (
            <span className="flex items-center gap-1">
              <User className="size-3.5 text-muted-foreground" aria-hidden="true" />
              {booking.customer_name}
            </span>
          )}
          {booking.customer_phone && (
            <a
              href={`tel:${booking.customer_phone}`}
              className="flex items-center gap-1 text-primary hover:underline"
              dir="ltr"
            >
              <Phone className="size-3.5" aria-hidden="true" />
              {booking.customer_phone}
            </a>
          )}
          {booking.customer_email && (
            <a
              href={`mailto:${booking.customer_email}`}
              className="flex items-center gap-1 text-primary hover:underline"
              dir="ltr"
            >
              <Mail className="size-3.5" aria-hidden="true" />
              {booking.customer_email}
            </a>
          )}
        </p>
      )}

      {place && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="size-3.5" aria-hidden="true" />
          {place}
        </p>
      )}

      {items.length > 0 && (
        <ul className="space-y-0.5 text-xs text-foreground">
          {items.map((item) => {
            // A service a package includes: listed under it, with no price of its own.
            const included = Boolean(item.parent_item_id);
            return (
              <li
                key={item.id}
                className={cn(
                  "flex justify-between gap-2",
                  included && "ps-4 text-muted-foreground",
                )}
              >
                <span>
                  {included ? "↳ " : ""}
                  {(isAr ? item.name_ar || item.name_en : item.name_en || item.name_ar) ??
                    (isAr ? "خدمة" : "Service")}
                  {item.quantity > 1 ? ` × ${item.quantity}` : ""}
                </span>
                {included ? (
                  <span>{isAr ? "مشمولة" : "included"}</span>
                ) : (
                  <span dir="ltr">{formatMoney(Number(item.line_total ?? 0), currency)}</span>
                )}
              </li>
            );
          })}
          {Number(booking.travel_fee ?? 0) > 0 && (
            <li className="flex justify-between gap-2 text-muted-foreground">
              <span>{isAr ? "التنقل" : "Travel"}</span>
              <span dir="ltr">{formatMoney(Number(booking.travel_fee), currency)}</span>
            </li>
          )}
          {Number(booking.discount_amount ?? 0) > 0 && (
            <li className="flex justify-between gap-2 text-success">
              <span>
                {(isAr
                  ? booking.discount_label_ar || booking.discount_label_en
                  : booking.discount_label_en || booking.discount_label_ar) ??
                  (isAr ? "خصم" : "Discount")}
              </span>
              <span dir="ltr">− {formatMoney(Number(booking.discount_amount), currency)}</span>
            </li>
          )}
          <li className="flex justify-between gap-2 border-t border-border pt-1 font-semibold">
            <span>{isAr ? "الإجمالي" : "Total"}</span>
            <span dir="ltr">{formatMoney(Number(booking.total ?? 0), currency)}</span>
          </li>
        </ul>
      )}

      {booking.notes && (
        <p className="whitespace-pre-line text-xs text-muted-foreground">{booking.notes}</p>
      )}
      <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
        <span>
          {isAr
            ? (SOURCE_TEXT[booking.source ?? ""]?.ar ?? "")
            : (SOURCE_TEXT[booking.source ?? ""]?.en ?? "")}
        </span>
        {Number(booking.deposit_amount ?? 0) > 0 && (
          <span>
            {isAr ? "عربون: " : "Deposit: "}
            <span dir="ltr">{formatMoney(Number(booking.deposit_amount), currency)}</span>
          </span>
        )}
      </p>
      {status !== "cancelled" && status !== "expired" && (
        <div className="space-y-1">
          <BookingInvoiceBlock booking={booking} page={page} />
          <BookingDiscountEditor
            key={`${booking.id}:${booking.discount_amount}`}
            booking={booking}
            page={page}
          />
        </div>
      )}
      {booking.status === "cancelled" && booking.cancel_reason && (
        <p className="text-xs text-destructive">{booking.cancel_reason}</p>
      )}

      {nextStatuses(status).length > 0 && (
        <footer className="flex flex-wrap gap-2 pt-1">
          {nextStatuses(status).map((next) => (
            <Button
              key={next}
              type="button"
              size="sm"
              variant={next === "cancelled" ? "outline" : "default"}
              className="h-8 text-xs"
              disabled={busy}
              onClick={() => onStatus(next)}
            >
              {actionText(status, next, isAr)}
            </Button>
          ))}
        </footer>
      )}
    </article>
  );
}
