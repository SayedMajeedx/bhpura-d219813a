import { addDays, todayIn, type BookingBlock, type BookingRules } from "@/lib/bookings/rules";
import { summariseBookings, type ReportBooking } from "@/features/bookings/lib/booking-report";

/**
 * A services store's bookings at a glance, for the dashboard: today's
 * appointments, how busy the week is, the next one, the requests waiting for
 * an answer and how full the next two weeks are. Pure, so it is tested
 * without a screen.
 */

export type GlanceBooking = ReportBooking & {
  id: string;
  reference: string;
  starts_at: string;
  ends_at: string;
  customer_name?: string | null;
};

export type BookingsGlance = {
  today: string;
  /** Confirmed appointments today, earliest first. */
  todayBookings: GlanceBooking[];
  /** Confirmed appointments from today through the next six days. */
  weekCount: number;
  /** Each of those days with its confirmed appointments. */
  week: Array<{ day: string; count: number }>;
  /** The next confirmed appointment that has not started, if any. */
  next: GlanceBooking | null;
  /** Requests waiting for the store's answer. */
  pendingRequests: number;
  /** How full the next 14 days are (days with a booking of the days it takes bookings), 0-1. */
  occupancy: number;
  bookedDays: number;
  bookableDays: number;
};

export const GLANCE_DAYS = 14;

/** The last day the glance's bookings need to be fetched for, given today. */
export function glanceEnd(today: string): string {
  return addDays(today, GLANCE_DAYS - 1);
}

export function bookingsGlance({
  bookings,
  blocks,
  rules,
  pendingRequests,
  now,
}: {
  bookings: readonly GlanceBooking[];
  blocks: readonly BookingBlock[];
  rules: Pick<BookingRules, "timezone" | "closed_weekdays">;
  pendingRequests: number;
  now: Date;
}): BookingsGlance {
  const today = todayIn(rules.timezone, now);
  const confirmed = bookings.filter((booking) => booking.status === "confirmed");
  const byStart = (a: GlanceBooking, b: GlanceBooking) => a.starts_at.localeCompare(b.starts_at);

  const week = Array.from({ length: 7 }, (_, offset) => {
    const day = addDays(today, offset);
    return { day, count: confirmed.filter((booking) => booking.event_date === day).length };
  });
  const report = summariseBookings({
    bookings,
    blocks,
    rules,
    from: today,
    to: glanceEnd(today),
  });
  const upcoming = confirmed.filter((booking) => new Date(booking.starts_at) > now).sort(byStart);

  return {
    today,
    todayBookings: confirmed.filter((booking) => booking.event_date === today).sort(byStart),
    weekCount: week.reduce((sum, entry) => sum + entry.count, 0),
    week,
    next: upcoming[0] ?? null,
    pendingRequests,
    occupancy: report.occupancy,
    bookedDays: report.bookedDays,
    bookableDays: report.bookableDays,
  };
}
