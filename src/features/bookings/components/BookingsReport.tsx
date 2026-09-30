import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { bookingsQueries } from "@/lib/data/bookings";
import { weekdayNames } from "@/lib/bookings/format";
import { reportPeriod, summariseBookings } from "@/features/bookings/lib/booking-report";
import type { BookingsPage } from "@/features/bookings/hooks/use-bookings-page";

type Period = "month" | "last30" | "last90";

const PERIODS: Array<{ id: Period; ar: string; en: string }> = [
  { id: "month", ar: "هذا الشهر", en: "This month" },
  { id: "last30", ar: "آخر 30 يوماً", en: "Last 30 days" },
  { id: "last90", ar: "آخر 90 يوماً", en: "Last 90 days" },
];

const SOURCES: Record<string, { ar: string; en: string }> = {
  storefront: { ar: "المتجر", en: "Storefront" },
  whatsapp: { ar: "واتساب", en: "WhatsApp" },
  admin: { ar: "الفريق", en: "Staff" },
};

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-display text-xl font-bold text-foreground" dir="ltr">
        {value}
      </p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** How the bookings went over a period: occupancy, revenue, requests, sources, services, weekdays. */
export function BookingsReport({ page }: { page: BookingsPage }) {
  const { isAr, brand, rules, today, currency } = page;
  const lang = isAr ? "ar" : "en";
  const [period, setPeriod] = useState<Period>("month");
  const { from, to } = reportPeriod(period, today);
  const bookings = useQuery(bookingsQueries.range(brand.id, from, to)).data;
  const blocks = useQuery(bookingsQueries.blocks(brand.id, from, to)).data;
  const report = useMemo(
    () => summariseBookings({ bookings: bookings ?? [], blocks: blocks ?? [], rules, from, to }),
    [bookings, blocks, rules, from, to],
  );
  const percent = (value: number) => `${Math.round(value * 100)}%`;
  const busiest = Math.max(1, ...report.byWeekday);
  const days = weekdayNames(isAr, 0);

  return (
    <section className="space-y-4" aria-busy={!bookings}>
      <div className="flex flex-wrap gap-2" role="group" aria-label={isAr ? "الفترة" : "Period"}>
        {PERIODS.map((option) => (
          <Button
            key={option.id}
            type="button"
            size="sm"
            variant={period === option.id ? "default" : "outline"}
            aria-pressed={period === option.id}
            onClick={() => setPeriod(option.id)}
          >
            {option[lang]}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Figure
          label={isAr ? "إشغال التقويم" : "Calendar booked"}
          value={percent(report.occupancy)}
          hint={
            isAr
              ? `${report.bookedDays} من ${report.bookableDays} يوماً`
              : `${report.bookedDays} of ${report.bookableDays} days`
          }
        />
        <Figure
          label={isAr ? "الحجوزات المؤكدة" : "Confirmed bookings"}
          value={String(report.confirmed)}
          hint={isAr ? `${report.cancelled} ملغي` : `${report.cancelled} cancelled`}
        />
        <Figure
          label={isAr ? "الإيرادات" : "Revenue"}
          value={formatMoney(report.revenue, currency)}
          hint={
            isAr
              ? `متوسط الحجز ${formatMoney(report.averageValue, currency)}`
              : `Average ${formatMoney(report.averageValue, currency)}`
          }
        />
        <Figure
          label={isAr ? "طلبات تحولت لحجوزات" : "Requests booked"}
          value={percent(report.requestConversion)}
          hint={isAr ? `${report.requests} طلب` : `${report.requests} requests`}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground">
            {isAr ? "أكثر الخدمات حجزاً" : "Top services"}
          </h3>
          {report.topServices.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {isAr ? "لا حجوزات مؤكدة في هذه الفترة." : "No confirmed bookings in this period."}
            </p>
          ) : (
            <ol className="space-y-1.5 text-sm">
              {report.topServices.map((service) => (
                <li key={service.key} className="flex justify-between gap-2">
                  <span className="truncate">
                    {isAr ? service.name_ar : service.name_en}
                    <span className="text-muted-foreground"> × {service.count}</span>
                  </span>
                  <span dir="ltr">{formatMoney(service.revenue, currency)}</span>
                </li>
              ))}
            </ol>
          )}
          <h3 className="pt-2 text-sm font-semibold text-foreground">
            {isAr ? "مصدر الحجوزات" : "Where bookings came from"}
          </h3>
          <ul className="flex flex-wrap gap-2 text-xs">
            {Object.entries(report.bySource).map(([source, count]) => (
              <li key={source} className="rounded-full bg-muted px-2.5 py-1 text-foreground">
                {SOURCES[source]?.[lang] ?? source}: {count}
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground">
            {isAr ? "أكثر الأيام طلباً" : "Busiest weekdays"}
          </h3>
          <ul className="space-y-1.5">
            {report.byWeekday.map((count, weekday) => (
              <li key={days[weekday]} className="flex items-center gap-2 text-xs">
                <span className="w-12 shrink-0 text-muted-foreground">{days[weekday]}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className={cn("block h-full rounded-full bg-primary")}
                    style={{ width: `${(count / busiest) * 100}%` }}
                  />
                </span>
                <span className="w-6 text-end text-foreground">{count}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
