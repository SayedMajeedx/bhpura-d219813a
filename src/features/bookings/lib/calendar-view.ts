import {
  dayState,
  monthGrid,
  takesPlace,
  type BookingBlock,
  type BookingRules,
  type DayState,
} from "@/lib/bookings/rules";

/**
 * What the admin calendar shows for each day of a month: its state for staff
 * (closed, blocked, full or available; the notice period does not bind
 * staff), how many places are taken, how many requests wait, and whether the
 * day is already behind us. Pure, so the calendar is tested without a screen.
 */

export type CalendarBooking = {
  id: string;
  event_date: string;
  status: string;
  hold_expires_at?: string | null;
};

export type CalendarCell = {
  day: string;
  inMonth: boolean;
  isToday: boolean;
  isPast: boolean;
  state: DayState;
  taken: number;
  /** The store's day limit; null when every service is booked by its own capacity instead. */
  capacity: number | null;
  requests: number;
  /** Bookings on the day waiting for the store: requests, and live holds for a payment. */
  pending: number;
  /** Bookings the store has confirmed (or finished) on the day. */
  confirmed: number;
  blocked: boolean;
};

export function summariseMonth({
  year,
  month,
  weekStartsOn,
  rules,
  bookings,
  blocks,
  today,
  now = new Date(),
  storeLimit = true,
}: {
  year: number;
  month: number;
  weekStartsOn: number;
  rules: BookingRules;
  bookings: readonly CalendarBooking[];
  blocks: readonly BookingBlock[];
  today: string;
  now?: Date;
  /**
   * The store's day limit decides when a day is full (`storeDayLimitApplies`): false when every
   * service has its own capacity, and a day is then never "full" by the store's count.
   */
  storeLimit?: boolean;
}): CalendarCell[][] {
  const byDay = new Map<string, CalendarBooking[]>();
  for (const booking of bookings) {
    const list = byDay.get(booking.event_date) ?? [];
    list.push(booking);
    byDay.set(booking.event_date, list);
  }
  return monthGrid(year, month, weekStartsOn).map((week) =>
    week.map(({ day, inMonth }) => {
      const dayBookings = byDay.get(day) ?? [];
      const taken = dayBookings.filter((booking) => takesPlace(booking, now)).length;
      const { state: byStore } = dayState({ day, today, rules, blocks, taken, staff: true });
      const state = !storeLimit && byStore === "full" ? "available" : byStore;
      return {
        day,
        inMonth,
        isToday: day === today,
        isPast: day < today,
        state,
        taken,
        capacity: storeLimit ? rules.daily_capacity : null,
        requests: dayBookings.filter((booking) => booking.status === "requested").length,
        pending: dayBookings.filter(
          (booking) =>
            booking.status === "requested" ||
            (booking.status === "hold" && takesPlace(booking, now)),
        ).length,
        confirmed: dayBookings.filter(
          (booking) => booking.status === "confirmed" || booking.status === "completed",
        ).length,
        blocked: blocks.some((block) => day >= block.starts_on && day <= block.ends_on),
      };
    }),
  );
}
