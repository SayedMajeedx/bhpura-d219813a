import { addDays, weekdayOf, type BookingBlock, type BookingRules } from "@/lib/bookings/rules";

/**
 * A services store's bookings over a period, as numbers a merchant acts on:
 * how full the calendar was, what it earned, how many requests became
 * bookings, where bookings came from, which services sold and which weekdays
 * are busiest. Pure, so the report is tested without a screen.
 */

export type ReportBooking = {
  event_date: string;
  status: string;
  source: string;
  total: number | string | null;
  booking_items?: ReadonlyArray<{
    product_id: string | null;
    name_en: string | null;
    name_ar: string | null;
    quantity: number;
    line_total: number | string | null;
  }> | null;
};

export type BookingReport = {
  /** Days in the period the store took bookings (not closed or blocked). */
  bookableDays: number;
  /** Of those, the days with at least one confirmed or completed booking. */
  bookedDays: number;
  /** bookedDays / bookableDays, 0-1. */
  occupancy: number;
  confirmed: number;
  revenue: number;
  averageValue: number;
  requests: number;
  /** Requests that became bookings, of those the store answered, 0-1. */
  requestConversion: number;
  cancelled: number;
  bySource: Record<string, number>;
  topServices: Array<{
    key: string;
    name_en: string;
    name_ar: string;
    count: number;
    revenue: number;
  }>;
  /** Confirmed bookings by weekday, 0 = Sunday. */
  byWeekday: number[];
};

const KEPT = new Set(["confirmed", "completed"]);

export function summariseBookings({
  bookings,
  blocks,
  rules,
  from,
  to,
}: {
  bookings: readonly ReportBooking[];
  blocks: readonly BookingBlock[];
  rules: Pick<BookingRules, "closed_weekdays">;
  from: string;
  to: string;
}): BookingReport {
  const inPeriod = bookings.filter((b) => b.event_date >= from && b.event_date <= to);
  const kept = inPeriod.filter((b) => KEPT.has(b.status));

  let bookableDays = 0;
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const closed = rules.closed_weekdays.includes(weekdayOf(day));
    const blocked = blocks.some((block) => day >= block.starts_on && day <= block.ends_on);
    if (!closed && !blocked) bookableDays += 1;
  }
  const bookedDays = new Set(kept.map((b) => b.event_date)).size;
  const revenue = kept.reduce((sum, b) => sum + Number(b.total ?? 0), 0);

  // Requests: every booking that came in as a request is one; it counts as
  // converted once confirmed or completed, and as answered once it is no
  // longer waiting.
  const requests = inPeriod.filter((b) => b.source !== "admin" || b.status === "requested");
  const answered = requests.filter((b) => b.status !== "requested" && b.status !== "hold");
  const converted = answered.filter((b) => KEPT.has(b.status));

  const bySource: Record<string, number> = {};
  for (const booking of kept) bySource[booking.source] = (bySource[booking.source] ?? 0) + 1;

  const services = new Map<string, BookingReport["topServices"][number]>();
  for (const booking of kept) {
    for (const item of booking.booking_items ?? []) {
      const key = item.product_id ?? item.name_en ?? item.name_ar ?? "?";
      const entry = services.get(key) ?? {
        key,
        name_en: item.name_en ?? item.name_ar ?? "",
        name_ar: item.name_ar ?? item.name_en ?? "",
        count: 0,
        revenue: 0,
      };
      entry.count += item.quantity;
      entry.revenue += Number(item.line_total ?? 0);
      services.set(key, entry);
    }
  }

  const byWeekday = [0, 0, 0, 0, 0, 0, 0];
  for (const booking of kept) byWeekday[weekdayOf(booking.event_date)] += 1;

  const round3 = (n: number) => Math.round(n * 1000) / 1000;
  return {
    bookableDays,
    bookedDays,
    occupancy: bookableDays > 0 ? Math.min(1, bookedDays / bookableDays) : 0,
    confirmed: kept.length,
    revenue: round3(revenue),
    averageValue: kept.length > 0 ? round3(revenue / kept.length) : 0,
    requests: requests.length,
    requestConversion: answered.length > 0 ? converted.length / answered.length : 0,
    cancelled: inPeriod.filter((b) => b.status === "cancelled").length,
    bySource,
    topServices: [...services.values()]
      .sort((a, b) => b.revenue - a.revenue || b.count - a.count)
      .slice(0, 5),
    byWeekday,
  };
}

/** The periods the report offers, as ISO day ranges ending today. */
export function reportPeriod(
  kind: "month" | "last30" | "last90",
  today: string,
): { from: string; to: string } {
  if (kind === "month") return { from: `${today.slice(0, 7)}-01`, to: lastDayOfMonth(today) };
  return { from: addDays(today, kind === "last30" ? -29 : -89), to: today };
}

function lastDayOfMonth(day: string): string {
  const [year, month] = day.split("-").map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${day.slice(0, 7)}-${String(last).padStart(2, "0")}`;
}
