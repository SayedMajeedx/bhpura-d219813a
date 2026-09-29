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
  capacity: number;
  requests: number;
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
}: {
  year: number;
  month: number;
  weekStartsOn: number;
  rules: BookingRules;
  bookings: readonly CalendarBooking[];
  blocks: readonly BookingBlock[];
  today: string;
  now?: Date;
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
      const { state } = dayState({ day, today, rules, blocks, taken, staff: true });
      return {
        day,
        inMonth,
        isToday: day === today,
        isPast: day < today,
        state,
        taken,
        capacity: rules.daily_capacity,
        requests: dayBookings.filter((booking) => booking.status === "requested").length,
        blocked: blocks.some((block) => day >= block.starts_on && day <= block.ends_on),
      };
    }),
  );
}
