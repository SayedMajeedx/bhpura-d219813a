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

/** The first and last day a month's grid shows (for fetching its bookings). */
export function gridRange(year: number, month: number, weekStartsOn: number) {
  const weeks = monthGrid(year, month, weekStartsOn);
  return { from: weeks[0][0].day, to: weeks[weeks.length - 1][6].day };
}

/** The month after or before `{ year, month }`. */
export function shiftMonth(
  { year, month }: { year: number; month: number },
  by: number,
): { year: number; month: number } {
  const index = year * 12 + (month - 1) + by;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** "HH:MM" of an instant in the store's timezone. */
export function localTime(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

/** "6:00 PM" / "6:00 م" from "18:00". */
export function formatClock(time: string, isAr: boolean): string {
  const [hours, minutes] = time.split(":").map(Number);
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  const suffix = hours < 12 ? (isAr ? "ص" : "AM") : isAr ? "م" : "PM";
  return `${hour12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

/** "4 hours" / "4 ساعات", "90 min" / "90 دقيقة". */
export function formatDuration(minutes: number, isAr: boolean): string {
  if (minutes % 60 !== 0) return isAr ? `${minutes} دقيقة` : `${minutes} min`;
  const hours = minutes / 60;
  if (isAr) {
    if (hours === 1) return "ساعة";
    if (hours === 2) return "ساعتان";
    return hours <= 10 ? `${hours} ساعات` : `${hours} ساعة`;
  }
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

/** Weekday names from the given first weekday (0 = Sunday). */
export function weekdayNames(isAr: boolean, weekStartsOn: number): string[] {
  const names = isAr
    ? ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"]
    : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return names.map((_, index) => names[(index + weekStartsOn) % 7]);
}

/** "October 2026" / "أكتوبر 2026". */
export function monthTitle(year: number, month: number, isAr: boolean): string {
  return new Intl.DateTimeFormat(isAr ? "ar-u-nu-latn" : "en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

/** "Thursday 1 October" / "الخميس 1 أكتوبر". */
export function dayTitle(day: string, isAr: boolean): string {
  return new Intl.DateTimeFormat(isAr ? "ar-u-nu-latn" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}
