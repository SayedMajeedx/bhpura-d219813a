import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import { useStorefront } from "@/lib/storefront-context";
import { bookingOfCart, holdSecondsLeft } from "@/lib/bookings/cart";
import { bookingEnd } from "@/lib/bookings/rules";
import { dayTitle, formatClockRange } from "@/lib/bookings/format";

/**
 * At checkout, the booking being paid for: its date and time, and how long
 * the day stays held for the customer.
 */
export function BookingHoldBanner() {
  const { cart, lang } = useStorefront();
  const isAr = lang === "ar";
  const booking = bookingOfCart(cart);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!booking) return;
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, [booking]);

  if (!booking) return null;
  const left = holdSecondsLeft(booking.expiresAt, now);
  const minutes = Math.floor(left / 60);
  const seconds = String(left % 60).padStart(2, "0");
  const end = bookingEnd(booking.start, booking.durationMinutes);

  return (
    <section
      className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm"
      aria-live="polite"
    >
      <CalendarClock className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
      <div className="space-y-1">
        <p className="font-semibold text-foreground">
          {dayTitle(booking.day, isAr)} ·{" "}
          <span>{formatClockRange(booking.start, end.time, isAr)}</span>
        </p>
        <p className="text-muted-foreground">
          {left > 0 ? (
            <>
              {isAr ? "موعدك محجوز لك لمدة " : "Your date is held for "}
              <span dir="ltr" className="font-semibold text-foreground tabular-nums">
                {minutes}:{seconds}
              </span>
              {isAr
                ? ". أدخل مكان المناسبة كعنوان التوصيل."
                : ". Enter the event venue as the delivery address."}
            </>
          ) : isAr ? (
            "انتهت مدة الحجز المؤقت؛ يمكنك الإكمال إن كان اليوم ما زال متاحاً."
          ) : (
            "The hold has run out; you can still finish if the day is still free."
          )}
        </p>
        {(booking.depositPercent ?? 0) > 0 && (
          <p className="text-muted-foreground">
            {isAr
              ? `عند الدفع بالبطاقة: عربون ${booking.depositPercent}% الآن، والباقي يوم المناسبة.`
              : `Paying by card: a ${booking.depositPercent}% deposit now, the rest on the day.`}
          </p>
        )}
        <p className="text-xs text-muted-foreground" dir="ltr">
          {booking.reference}
        </p>
      </div>
    </section>
  );
}
