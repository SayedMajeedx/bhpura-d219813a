import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarClock, CalendarDays, Hourglass, Percent } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { bookingsQueries } from "@/lib/data/bookings";
import { addDays, todayIn } from "@/lib/bookings/rules";
import { dayTitle, formatClock, formatClockRange, localTime } from "@/lib/bookings/format";
import {
  bookingsGlance,
  glanceEnd,
  type GlanceBooking,
} from "@/features/bookings/lib/bookings-glance";

/**
 * The dashboard of a store that takes bookings: what is happening today, the
 * week ahead, the requests waiting, and how full the next two weeks are.
 */
export function BookingsGlanceCard({
  brandId,
  slug,
  isAr,
}: {
  brandId: string;
  slug: string;
  isAr: boolean;
}) {
  const rulesQ = useQuery(bookingsQueries.settings(brandId));
  const rules = rulesQ.data ?? null;
  const today = rules ? todayIn(rules.timezone) : "";
  const rangeQ = useQuery({
    ...bookingsQueries.range(brandId, today, glanceEnd(today || "2000-01-01")),
    enabled: Boolean(brandId && rules),
  });
  const blocksQ = useQuery({
    ...bookingsQueries.blocks(brandId, today, addDays(today || "2000-01-01", 13)),
    enabled: Boolean(brandId && rules),
  });
  const requestsQ = useQuery(bookingsQueries.requests(brandId));

  const glance = useMemo(
    () =>
      rules
        ? bookingsGlance({
            bookings: (rangeQ.data ?? []) as GlanceBooking[],
            blocks: blocksQ.data ?? [],
            rules,
            pendingRequests: requestsQ.data?.length ?? 0,
            now: new Date(),
          })
        : null,
    [rules, rangeQ.data, blocksQ.data, requestsQ.data],
  );

  // Bookings are on but the store has not set its hours and rules yet.
  if (rulesQ.isSuccess && !rules) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-primary/30 bg-primary/5 p-4">
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground">
            {isAr ? "اضبط أوقات الحجز أولاً" : "Set your booking hours first"}
          </p>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "حدّد أوقات العمل وكم حجزاً تستقبل في اليوم والعربون، لتظهر الأيام المتاحة لعملائك."
              : "Set your hours, how many bookings you take a day and any deposit, so customers see your free days."}
          </p>
        </div>
        <Button asChild size="sm">
          <Link to="/admin/b/$slug/bookings" params={{ slug }}>
            {isAr ? "فتح الحجوزات" : "Open bookings"}
          </Link>
        </Button>
      </Card>
    );
  }
  if (!glance || !rules) return null;

  const clock = (iso: string) => formatClock(localTime(iso, rules.timezone), isAr);
  const stats = [
    {
      icon: CalendarDays,
      label: isAr ? "اليوم" : "Today",
      value: String(glance.todayBookings.length),
      hint: isAr ? "موعد مؤكد" : "confirmed",
    },
    {
      icon: CalendarClock,
      label: isAr ? "الأسبوع القادم" : "Next 7 days",
      value: String(glance.weekCount),
      hint: isAr ? "موعد مؤكد" : "confirmed",
    },
    {
      icon: Hourglass,
      label: isAr ? "طلبات تنتظر ردك" : "Requests waiting",
      value: String(glance.pendingRequests),
      hint: isAr ? "تحتاج تأكيداً" : "need an answer",
      alert: glance.pendingRequests > 0,
    },
    {
      icon: Percent,
      label: isAr ? "الإشغال (14 يوماً)" : "Occupancy (14 days)",
      value: `${Math.round(glance.occupancy * 100)}%`,
      hint: isAr
        ? `${glance.bookedDays} من ${glance.bookableDays} يوم`
        : `${glance.bookedDays} of ${glance.bookableDays} days`,
    },
  ];

  return (
    <Card className="space-y-3 rounded-2xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-foreground">{isAr ? "الحجوزات" : "Bookings"}</h3>
        <Link
          to="/admin/b/$slug/bookings"
          params={{ slug }}
          className="text-xs font-semibold text-primary hover:underline"
        >
          {isAr ? "فتح التقويم ←" : "Open the calendar →"}
        </Link>
      </div>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map(({ icon: Icon, label, value, hint, alert }) => (
          <div
            key={label}
            className={cn(
              "min-w-0 rounded-xl border border-border bg-card p-3",
              alert && "border-warning bg-warning-subtle",
            )}
          >
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Icon className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-words">{label}</span>
            </dt>
            <dd className="mt-1 text-2xl font-bold text-foreground">{value}</dd>
            <p className="text-xs text-muted-foreground">{hint}</p>
          </div>
        ))}
      </dl>

      {glance.todayBookings.length > 0 ? (
        <ul className="space-y-1.5">
          {glance.todayBookings.slice(0, 4).map((booking) => (
            <li
              key={booking.id}
              className="flex flex-wrap items-baseline justify-between gap-x-3 rounded-lg bg-muted/40 px-3 py-2 text-sm"
            >
              <span dir={isAr ? "rtl" : "ltr"} className="font-semibold text-foreground">
                {formatClockRange(
                  localTime(booking.starts_at, rules.timezone),
                  localTime(booking.ends_at, rules.timezone),
                  isAr,
                )}
              </span>
              <span className="min-w-0 break-words text-muted-foreground">
                {booking.customer_name || booking.reference}
              </span>
            </li>
          ))}
        </ul>
      ) : glance.next ? (
        <p className="text-sm text-muted-foreground">
          {isAr ? "أقرب موعد: " : "Next appointment: "}
          <span className="font-semibold text-foreground">
            {dayTitle(glance.next.event_date, isAr)}
          </span>{" "}
          <span dir="ltr">{clock(glance.next.starts_at)}</span>
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          {isAr ? "لا مواعيد مؤكدة قادمة." : "No confirmed appointments coming up."}
        </p>
      )}
    </Card>
  );
}
