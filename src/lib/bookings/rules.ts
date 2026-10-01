/**
 * A services store's booking rules and the calendar they make, as pure
 * functions: which days can be booked, which start times and durations a
 * customer may pick, and when a booking ends. The database enforces the same
 * rules (supabase/migrations/20260930100000_bookings_engine.sql); these let
 * the storefront and the admin calendar show them without asking it.
 *
 * Dates are ISO days ("2026-10-01") and times are "HH:MM", both in the
 * store's own timezone.
 */

export type BookingRules = {
  timezone: string;
  /** How many bookings the store takes on one day. */
  daily_capacity: number;
  /** Earliest start, "HH:MM". */
  open_time: string;
  /** Latest start, "HH:MM". */
  last_start_time: string;
  /** Start times fall on this grid (15, 30 or 60 minutes). */
  slot_minutes: number;
  min_duration_minutes: number;
  max_duration_minutes: number;
  duration_step_minutes: number;
  /** A customer can book from today + lead_days. */
  lead_days: number;
  /** ... up to today + horizon_days. */
  horizon_days: number;
  /** How long a checkout holds a day. */
  hold_minutes: number;
  /** 0 = Sunday ... 6 = Saturday. */
  closed_weekdays: number[];
  /** Share of the total a card payment takes now (0 = none, 100 = all). */
  deposit_percent: number;
  /** The travel fee for an area without its own fee; null = no travel fees. */
  travel_fee_default: number | null;
};

/** The storefront's rules also carry the per-area travel fees (area code to fee). */
export type PublicBookingRules = BookingRules & { travel_fees: Record<string, number> };

/** The travel fee for an area: its own fee, else the store's default, else none (as booking_travel_fee). */
export function travelFeeFor(
  rules: Pick<PublicBookingRules, "travel_fees" | "travel_fee_default">,
  areaCode: string | null | undefined,
): number | null {
  const own = areaCode ? rules.travel_fees?.[areaCode] : undefined;
  if (typeof own === "number") return own;
  return rules.travel_fee_default ?? null;
}

export const DEFAULT_BOOKING_RULES: BookingRules = {
  timezone: "Asia/Bahrain",
  daily_capacity: 1,
  open_time: "10:00",
  last_start_time: "22:00",
  slot_minutes: 30,
  min_duration_minutes: 180,
  max_duration_minutes: 480,
  duration_step_minutes: 60,
  lead_days: 1,
  horizon_days: 365,
  hold_minutes: 15,
  closed_weekdays: [],
  deposit_percent: 0,
  travel_fee_default: null,
};

export type DayState = "past" | "beyond" | "closed" | "blocked" | "full" | "available";

export type BookingBlock = { starts_on: string; ends_on: string };

/** "HH:MM" (or "HH:MM:SS") to minutes after midnight. */
export function minutesOf(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + (minutes || 0);
}

/** Minutes after midnight to "HH:MM" (wrapping past midnight). */
export function timeOf(totalMinutes: number): string {
  const wrapped = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(wrapped / 60);
  const minutes = wrapped % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** Every start time a customer may pick, earliest first. */
export function startTimes(rules: BookingRules): string[] {
  const times: string[] = [];
  const last = minutesOf(rules.last_start_time);
  for (let at = minutesOf(rules.open_time); at <= last; at += rules.slot_minutes) {
    if (at % rules.slot_minutes === 0) times.push(timeOf(at));
  }
  return times;
}

/** Every duration a customer may pick, in minutes, shortest first. */
export function durations(rules: BookingRules): number[] {
  const out: number[] = [];
  for (
    let minutes = rules.min_duration_minutes;
    minutes <= rules.max_duration_minutes;
    minutes += rules.duration_step_minutes
  ) {
    out.push(minutes);
  }
  return out;
}

/** When a booking that starts at `start` and lasts `minutes` ends; `nextDay` when it runs past midnight. */
export function bookingEnd(start: string, minutes: number): { time: string; nextDay: boolean } {
  const end = minutesOf(start) + minutes;
  return { time: timeOf(end), nextDay: end >= 1440 };
}

/** Whether the database would accept this start time and duration. */
export function isValidSlot(rules: BookingRules, start: string, minutes: number): boolean {
  return startTimes(rules).includes(timeOf(minutesOf(start))) && durations(rules).includes(minutes);
}

/** An ISO day moved by `days`. */
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekdayOf(day: string): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

/** Today in the store's timezone. */
export function todayIn(timezone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * A day's state, as the database decides it (booking_day_state): the notice
 * period and horizon apply to customers, not to staff (`staff`).
 */
export function dayState({
  day,
  today,
  rules,
  blocks,
  taken,
  staff = false,
}: {
  day: string;
  today: string;
  rules: BookingRules;
  blocks: readonly BookingBlock[];
  /** Places taken on the day (confirmed, completed and live holds). */
  taken: number;
  staff?: boolean;
}): { state: DayState; remaining: number } {
  if (!staff && day < addDays(today, rules.lead_days)) return { state: "past", remaining: 0 };
  if (!staff && day > addDays(today, rules.horizon_days)) return { state: "beyond", remaining: 0 };
  if (rules.closed_weekdays.includes(weekdayOf(day))) return { state: "closed", remaining: 0 };
  if (blocks.some((block) => day >= block.starts_on && day <= block.ends_on)) {
    return { state: "blocked", remaining: 0 };
  }
  if (taken >= rules.daily_capacity) return { state: "full", remaining: 0 };
  return { state: "available", remaining: rules.daily_capacity - taken };
}

export type CalendarDay = { day: string; inMonth: boolean };

/**
 * A month as whole weeks (for a calendar grid), starting on `weekStartsOn`
 * (0 = Sunday, 6 = Saturday). `month` is 1-12.
 */
export function monthGrid(year: number, month: number, weekStartsOn = 0): CalendarDay[][] {
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const lead = (weekdayOf(first) - weekStartsOn + 7) % 7;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells = Math.ceil((lead + daysInMonth) / 7) * 7;
  const start = addDays(first, -lead);
  const weeks: CalendarDay[][] = [];
  for (let index = 0; index < cells; index += 1) {
    const day = addDays(start, index);
    if (index % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1].push({ day, inMonth: day.slice(0, 7) === first.slice(0, 7) });
  }
  return weeks;
}

/** Normalises a settings row (times may come back as "HH:MM:SS") into rules. */
export function toBookingRules(
  row: Partial<Record<keyof BookingRules, unknown>> | null,
): BookingRules {
  if (!row) return DEFAULT_BOOKING_RULES;
  const number = (key: keyof BookingRules) =>
    typeof row[key] === "number" ? (row[key] as number) : (DEFAULT_BOOKING_RULES[key] as number);
  const time = (key: "open_time" | "last_start_time") =>
    typeof row[key] === "string"
      ? timeOf(minutesOf(row[key] as string))
      : DEFAULT_BOOKING_RULES[key];
  return {
    timezone: typeof row.timezone === "string" ? row.timezone : DEFAULT_BOOKING_RULES.timezone,
    daily_capacity: number("daily_capacity"),
    open_time: time("open_time"),
    last_start_time: time("last_start_time"),
    slot_minutes: number("slot_minutes"),
    min_duration_minutes: number("min_duration_minutes"),
    max_duration_minutes: number("max_duration_minutes"),
    duration_step_minutes: number("duration_step_minutes"),
    lead_days: number("lead_days"),
    horizon_days: number("horizon_days"),
    hold_minutes: number("hold_minutes"),
    deposit_percent: number("deposit_percent"),
    travel_fee_default:
      row.travel_fee_default === null || row.travel_fee_default === undefined
        ? null
        : Number(row.travel_fee_default),
    closed_weekdays: Array.isArray(row.closed_weekdays)
      ? (row.closed_weekdays as unknown[]).filter((d): d is number => typeof d === "number")
      : [],
  };
}

// ── Status ───────────────────────────────────────────────────────────────────

export const BOOKING_STATUSES = [
  "hold",
  "requested",
  "confirmed",
  "completed",
  "cancelled",
  "expired",
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** What staff can move a booking to next (set_booking_status allows the same). */
export function nextStatuses(status: BookingStatus): BookingStatus[] {
  switch (status) {
    case "requested":
      return ["confirmed", "cancelled"];
    // A day held for a payment: staff confirm it once the payment is checked, or release it.
    case "hold":
      return ["confirmed", "cancelled"];
    case "expired":
      return ["confirmed"];
    case "confirmed":
      return ["completed", "cancelled"];
    case "completed":
    case "cancelled":
      return ["confirmed"];
    default:
      return [];
  }
}

/** Whether a booking takes a place on its day. */
export function takesPlace(
  booking: { status: string; hold_expires_at?: string | null },
  now: Date = new Date(),
): boolean {
  if (booking.status === "confirmed" || booking.status === "completed") return true;
  return (
    booking.status === "hold" &&
    Boolean(booking.hold_expires_at) &&
    new Date(booking.hold_expires_at!) > now
  );
}
