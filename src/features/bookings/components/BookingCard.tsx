import { Clock, MapPin, Phone, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { nextStatuses, type BookingStatus } from "@/lib/bookings/rules";
import type { Booking } from "@/lib/data/bookings";
import { formatClock, localTime } from "@/features/bookings/lib/calendar-view";

const STATUS_TEXT: Record<BookingStatus, { ar: string; en: string; tone: string }> = {
  hold: { ar: "قيد الدفع", en: "Checking out", tone: "bg-info-subtle text-info" },
  requested: { ar: "طلب حجز", en: "Request", tone: "bg-warning-subtle text-warning" },
  confirmed: { ar: "مؤكد", en: "Confirmed", tone: "bg-success-subtle text-success" },
  completed: { ar: "منتهي", en: "Completed", tone: "bg-muted text-muted-foreground" },
  cancelled: { ar: "ملغي", en: "Cancelled", tone: "bg-destructive-subtle text-destructive" },
  expired: { ar: "منتهي الصلاحية", en: "Expired", tone: "bg-muted text-muted-foreground" },
};

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

/** A place is shown as area, venue, whatever the booking recorded. */
function placeText(location: unknown): string {
  if (!location || typeof location !== "object") return "";
  const values = Object.values(location as Record<string, unknown>).filter(
    (value): value is string => typeof value === "string" && value.trim() !== "",
  );
  return values.join("، ");
}

export function BookingCard({
  booking,
  isAr,
  currency,
  timezone,
  busy,
  onStatus,
}: {
  booking: Booking;
  isAr: boolean;
  currency: string;
  timezone: string;
  busy: boolean;
  onStatus: (status: BookingStatus) => void;
}) {
  const status = (booking.status as BookingStatus) ?? "confirmed";
  const text = STATUS_TEXT[status] ?? STATUS_TEXT.confirmed;
  const start = localTime(booking.starts_at, timezone);
  const end = localTime(booking.ends_at, timezone);
  const place = placeText(booking.location);
  const items = booking.booking_items ?? [];

  return (
    <article className="space-y-2 rounded-xl border border-border bg-card p-3 text-sm">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-semibold text-foreground">
            <Clock className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <span dir="ltr">
              {formatClock(start, isAr)} – {formatClock(end, isAr)}
            </span>
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
          {items.map((item) => (
            <li key={item.id} className="flex justify-between gap-2">
              <span>
                {(isAr ? item.name_ar || item.name_en : item.name_en || item.name_ar) ??
                  (isAr ? "خدمة" : "Service")}
                {item.quantity > 1 ? ` × ${item.quantity}` : ""}
              </span>
              <span dir="ltr">{formatMoney(Number(item.line_total ?? 0), currency)}</span>
            </li>
          ))}
          <li className="flex justify-between gap-2 border-t border-border pt-1 font-semibold">
            <span>{isAr ? "الإجمالي" : "Total"}</span>
            <span dir="ltr">{formatMoney(Number(booking.total ?? 0), currency)}</span>
          </li>
        </ul>
      )}

      {booking.notes && <p className="text-xs text-muted-foreground">{booking.notes}</p>}
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
