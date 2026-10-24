/**
 * When a shopper may have an order: the store's delivery schedule (`business_settings
 * .delivery_schedule`, migration `20261024140000`). A florist, a gift shop or a bakery that bakes
 * for a set day lets the shopper pick the day, and the time if the store works in time windows,
 * at checkout (`DeliveryTimeCard`); the order keeps it (`orders.requested_date` / `requested_slot`)
 * and staff read it on the order. Days are counted on the store's own clock (`timezone`), from
 * the earliest moment the store can be ready (`lead_hours` from now) to `days_ahead` days from
 * today, on the weekdays it works. The database holds the same rule (`delivery_time_problem`,
 * run against this one by `tests/delivery-schedule-parity.test.ts`) and refuses a time that is
 * not offered, whatever the browser sends.
 */

export type DeliverySlot = { from: string; to: string };

export type DeliverySchedule = {
  enabled: boolean;
  /** Hours from the order to the earliest time it can be ready. */
  lead_hours: number;
  /** How many days ahead a shopper may pick. */
  days_ahead: number;
  /** The days the store delivers or hands over, 0 = Sunday. */
  weekdays: number[];
  /** Time windows on a day ("10:00"-"14:00"); none: the shopper picks a day only. */
  slots: DeliverySlot[];
  timezone: string;
  /** How the order is handed over for the schedule to apply. */
  applies_to: Array<"delivery" | "pickup">;
};

export const GCC_TIMEZONES = [
  { value: "Asia/Bahrain", ar: "البحرين", en: "Bahrain" },
  { value: "Asia/Riyadh", ar: "السعودية", en: "Saudi Arabia" },
  { value: "Asia/Kuwait", ar: "الكويت", en: "Kuwait" },
  { value: "Asia/Qatar", ar: "قطر", en: "Qatar" },
  { value: "Asia/Dubai", ar: "الإمارات", en: "UAE" },
  { value: "Asia/Muscat", ar: "عُمان", en: "Oman" },
] as const;

const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const DEFAULT_SCHEDULE: DeliverySchedule = {
  enabled: false,
  lead_hours: 24,
  days_ahead: 7,
  weekdays: ALL_WEEKDAYS,
  slots: [],
  timezone: "Asia/Bahrain",
  applies_to: ["delivery", "pickup"],
};

const bounded = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

const knownTimezone = (value: unknown) =>
  GCC_TIMEZONES.some((zone) => zone.value === value)
    ? (value as string)
    : DEFAULT_SCHEDULE.timezone;

/** The schedule as stored, read safely: a field missing or out of range takes its default. */
export function readSchedule(raw: unknown): DeliverySchedule {
  const s =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const weekdays = Array.isArray(s.weekdays)
    ? [
        ...new Set(s.weekdays.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)),
      ].sort()
    : ALL_WEEKDAYS;
  const slots = Array.isArray(s.slots)
    ? s.slots
        .filter(
          (slot): slot is DeliverySlot =>
            Boolean(slot) &&
            TIME.test(String((slot as DeliverySlot).from)) &&
            TIME.test(String((slot as DeliverySlot).to)) &&
            (slot as DeliverySlot).from < (slot as DeliverySlot).to,
        )
        .map(({ from, to }) => ({ from, to }))
        .slice(0, 12)
    : [];
  const appliesTo = Array.isArray(s.applies_to)
    ? (s.applies_to.filter(
        (f) => f === "delivery" || f === "pickup",
      ) as DeliverySchedule["applies_to"])
    : DEFAULT_SCHEDULE.applies_to;
  return {
    enabled: s.enabled === true,
    lead_hours: bounded(s.lead_hours, 0, 720, DEFAULT_SCHEDULE.lead_hours),
    days_ahead: bounded(s.days_ahead, 1, 60, DEFAULT_SCHEDULE.days_ahead),
    weekdays: weekdays.length ? weekdays : ALL_WEEKDAYS,
    slots: [...slots].sort((a, b) => a.from.localeCompare(b.from)),
    timezone: knownTimezone(s.timezone),
    applies_to: appliesTo,
  };
}

/** Whether a shopper picks a time for an order handed over this way. */
export function scheduleApplies(
  schedule: DeliverySchedule,
  fulfillment: string | null | undefined,
) {
  return (
    schedule.enabled &&
    (fulfillment === "delivery" || fulfillment === "pickup") &&
    schedule.applies_to.includes(fulfillment)
  );
}

export const slotValue = (slot: DeliverySlot) => `${slot.from}-${slot.to}`;

/** An instant's day and time on a clock: { date: "2026-10-30", time: "14:05" }. */
function localParts(at: Date, timezone: string): { date: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

/** A calendar day moved by n days. */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** 0 = Sunday, as Postgres's `extract(dow ...)`. */
export const weekdayOf = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

export type DeliveryDay = { date: string; slots: DeliverySlot[] };

/**
 * The days (and, on each, the time windows) a shopper may pick now: from the earliest the store
 * can be ready to `days_ahead` days from today, on its working days. On the earliest day only a
 * window that starts after it is offered; a day with windows but none left is not offered.
 */
export function deliveryDays(schedule: DeliverySchedule, now: Date): DeliveryDay[] {
  const today = localParts(now, schedule.timezone).date;
  const earliest = localParts(
    new Date(now.getTime() + schedule.lead_hours * 3_600_000),
    schedule.timezone,
  );
  const days: DeliveryDay[] = [];
  for (
    let date = earliest.date;
    date <= addDays(today, schedule.days_ahead);
    date = addDays(date, 1)
  ) {
    if (!schedule.weekdays.includes(weekdayOf(date))) continue;
    if (schedule.slots.length === 0) {
      days.push({ date, slots: [] });
      continue;
    }
    const slots =
      date === earliest.date
        ? schedule.slots.filter((slot) => slot.from >= earliest.time)
        : schedule.slots;
    if (slots.length) days.push({ date, slots });
  }
  return days;
}

/**
 * Why this day and time cannot be had, or null when they can: the database's
 * `delivery_time_problem`, for the checkout to say it before the order is placed.
 */
export function deliveryTimeProblem(
  schedule: DeliverySchedule,
  fulfillment: string | null | undefined,
  date: string | null | undefined,
  slot: string | null | undefined,
  now: Date,
): "DELIVERY_TIME_UNAVAILABLE" | null {
  if (!date || !scheduleApplies(schedule, fulfillment)) return "DELIVERY_TIME_UNAVAILABLE";
  const day = deliveryDays(schedule, now).find((d) => d.date === date);
  if (!day) return "DELIVERY_TIME_UNAVAILABLE";
  if (day.slots.length === 0) return slot ? "DELIVERY_TIME_UNAVAILABLE" : null;
  return day.slots.some((s) => slotValue(s) === slot) ? null : "DELIVERY_TIME_UNAVAILABLE";
}

/** A day as a shopper reads it: "Today", "Tomorrow", else "Thu 30 Oct". */
export function dayLabel(date: string, schedule: DeliverySchedule, now: Date, lang: "ar" | "en") {
  const today = localParts(now, schedule.timezone).date;
  if (date === today) return lang === "ar" ? "اليوم" : "Today";
  if (date === addDays(today, 1)) return lang === "ar" ? "غداً" : "Tomorrow";
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-u-nu-latn" : "en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** A window as it is read: "10:00 – 14:00" (start to end in either language). */
export const slotLabel = (slot: string) => slot.replace("-", " – ");

/** The day and time an order asked for, as staff and the shopper read it. */
export function requestedTimeLabel(
  date: string | null | undefined,
  slot: string | null | undefined,
  lang: "ar" | "en",
): string | null {
  if (!date) return null;
  const [y, m, d] = date.split("-").map(Number);
  const day = new Intl.DateTimeFormat(lang === "ar" ? "ar-u-nu-latn" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
  return slot ? `${day} · ${slotLabel(slot)}` : day;
}
