import { zonedInstant } from "@/lib/bookings/add-to-calendar";
import { addDays, knownTimezone, localParts, weekdayOf } from "@/lib/delivery-schedule";

/**
 * Whether a store is taking orders now: its busy pause (`business_settings.orders_paused_until`)
 * and its opening hours (`opening_hours`). The database holds both (migration 20261027110000): a
 * storefront order or booking placed while paused is refused (ORDERS_PAUSED), and an order outside
 * the hours of a store that refuses them too (STORE_CLOSED). `openState` is the twin of
 * `store_open_state`, run against it by tests/opening-hours-parity.test.ts; the storefront's
 * banner and checkout read `orderIntake`.
 */

export type HoursWindow = { from: string; to: string };

export type OpeningHours = {
  enabled: boolean;
  timezone: string;
  /** Outside the hours: take the order and say when it is handled, or refuse it. */
  after_hours: "accept" | "refuse";
  /** The windows of each weekday, 0 = Sunday. */
  days: HoursWindow[][];
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A window the database counts: "HH:MM" to "HH:MM" (or "24:00"), ending after it starts. */
export const validWindow = (w: Partial<HoursWindow> | null | undefined): w is HoursWindow =>
  Boolean(w) &&
  typeof w?.from === "string" &&
  typeof w?.to === "string" &&
  TIME.test(w.from) &&
  (TIME.test(w.to) || w.to === "24:00") &&
  w.from < w.to;

export const DEFAULT_HOURS: OpeningHours = {
  enabled: false,
  timezone: "Asia/Bahrain",
  after_hours: "accept",
  days: [0, 1, 2, 3, 4, 5, 6].map(() => [{ from: "10:00", to: "22:00" }]),
};

/** The hours as stored, read as the database reads them. */
export function readHours(raw: unknown): OpeningHours {
  const h =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const days =
    h.days && typeof h.days === "object" && !Array.isArray(h.days)
      ? (h.days as Record<string, unknown>)
      : null;
  return {
    enabled: h.enabled === true,
    timezone: knownTimezone(h.timezone),
    after_hours: h.after_hours === "refuse" ? "refuse" : "accept",
    days: [0, 1, 2, 3, 4, 5, 6].map((day) => {
      // No days stored: no window, as the database reads it (the editor starts from DEFAULT_HOURS).
      if (!days) return [];
      const list = days[String(day)];
      return Array.isArray(list) ? (list as HoursWindow[]).filter(validWindow) : [];
    }),
  };
}

/** The hours as stored (`opening_hours`), keyed by weekday as the database reads them. */
export function storedHours(hours: OpeningHours): Record<string, unknown> {
  return {
    enabled: hours.enabled,
    timezone: hours.timezone,
    after_hours: hours.after_hours,
    days: Object.fromEntries(hours.days.map((list, day) => [String(day), list])),
  };
}

/**
 * Whether the store is open at a moment by its hours and, when it is not, the moment it next
 * opens (null: its hours never open). A store with its hours off is always open.
 */
export function openState(raw: unknown, at: Date): { open: boolean; nextOpen: string | null } {
  const hours = readHours(raw);
  if (!hours.enabled) return { open: true, nextOpen: null };
  const { date, time } = localParts(at, hours.timezone);
  for (let d = 0; d <= 7; d += 1) {
    const day = addDays(date, d);
    let best: string | null = null;
    for (const w of hours.days[weekdayOf(day)]) {
      if (d === 0 && time >= w.from && time < w.to) return { open: true, nextOpen: null };
      if (d === 0 && w.from <= time) continue;
      if (best === null || w.from < best) best = w.from;
    }
    if (best !== null) return { open: false, nextOpen: zonedInstant(day, best, hours.timezone) };
  }
  return { open: false, nextOpen: null };
}

/**
 * The busy pause as stored: paused until a moment, "until reopened" (`infinity`), or not paused
 * (none, or a moment already past).
 */
export function pauseOf(value: unknown, at: Date): { paused: boolean; until: string | null } {
  if (value === null || value === undefined || value === "") return { paused: false, until: null };
  if (value === "infinity") return { paused: true, until: null };
  const until = new Date(String(value));
  if (Number.isNaN(until.getTime()) || until <= at) return { paused: false, until: null };
  return { paused: true, until: until.toISOString() };
}

export type OrderIntake =
  | { state: "open" }
  /** Busy: no new order until `until` (null: until the store reopens). */
  | { state: "paused"; until: string | null }
  /** Outside the hours: `accepting` takes the order to handle it from `opens`. */
  | { state: "closed"; accepting: boolean; opens: string | null };

/** Whether the store takes an order now, as the database will decide it. */
export function orderIntake(
  settings: { orders_paused_until?: unknown; opening_hours?: unknown } | null | undefined,
  at: Date,
): OrderIntake {
  const pause = pauseOf(settings?.orders_paused_until, at);
  if (pause.paused) return { state: "paused", until: pause.until };
  const state = openState(settings?.opening_hours, at);
  if (state.open) return { state: "open" };
  return {
    state: "closed",
    accepting: readHours(settings?.opening_hours).after_hours === "accept",
    opens: state.nextOpen,
  };
}

/** Whether checkout may place an order now. */
export const intakeTakesOrders = (intake: OrderIntake) =>
  intake.state === "open" || (intake.state === "closed" && intake.accepting);

const AR_DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const EN_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * A moment in the shopper's words, on the store's clock: "18:30" today, "tomorrow at 10:00",
 * else "Sunday at 10:00" (Western digits).
 */
export function momentLabel(iso: string, timezone: string, at: Date, lang: "ar" | "en"): string {
  const when = localParts(new Date(iso), timezone);
  const today = localParts(at, timezone).date;
  if (when.date === today) return lang === "ar" ? `اليوم ${when.time}` : `today at ${when.time}`;
  if (when.date === addDays(today, 1))
    return lang === "ar" ? `غدًا ${when.time}` : `tomorrow at ${when.time}`;
  const day = weekdayOf(when.date);
  return lang === "ar" ? `${AR_DAYS[day]} ${when.time}` : `${EN_DAYS[day]} at ${when.time}`;
}

/** What a shopper is told while the store does not simply take orders; null when it does. */
export function intakeSentence(
  intake: OrderIntake,
  hours: unknown,
  at: Date,
  lang: "ar" | "en",
): string | null {
  const tz = readHours(hours).timezone;
  if (intake.state === "open") return null;
  if (intake.state === "paused") {
    if (!intake.until)
      return lang === "ar"
        ? "لا نستقبل طلبات جديدة الآن. نعود قريبًا."
        : "We're not taking new orders right now. Back soon.";
    const back = momentLabel(intake.until, tz, at, lang);
    return lang === "ar"
      ? `لا نستقبل طلبات جديدة الآن، نعود ${back}.`
      : `We're not taking new orders right now, back ${back}.`;
  }
  const opens = intake.opens ? momentLabel(intake.opens, tz, at, lang) : null;
  if (intake.accepting) {
    if (!opens) return lang === "ar" ? "المتجر مغلق الآن." : "The store is closed now.";
    return lang === "ar"
      ? `المتجر مغلق الآن. يُجهَّز طلبك من ${opens}.`
      : `We're closed now. Your order will be handled from ${opens}.`;
  }
  if (!opens)
    return lang === "ar" ? "المتجر مغلق ولا يستقبل طلبات." : "The store is closed to orders.";
  return lang === "ar"
    ? `المتجر مغلق الآن، نستقبل الطلبات ${opens}.`
    : `We're closed now and take orders again ${opens}.`;
}
