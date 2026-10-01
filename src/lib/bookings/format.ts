import { monthGrid, type BookingStatus } from "@/lib/bookings/rules";

/**
 * Dates and times for booking calendars (the admin calendar and the
 * storefront's): months, weekday names, clock times and durations, in Arabic
 * and English.
 */

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

/**
 * "6:00 PM – 10:00 PM" / "6:00 م – 10:00 م": the range as one string that
 * reads start to end in both directions. In Arabic each clock is its own
 * right-to-left isolate; otherwise the digits, the Arabic AM/PM letters and the
 * dash reorder into a range that reads backwards. Put it in an element whose
 * direction is the page's (never a forced left-to-right one).
 */
export function formatClockRange(start: string, end: string, isAr: boolean): string {
  const from = formatClock(start, isAr);
  const to = formatClock(end, isAr);
  return isAr ? `\u2067${from}\u2069 – \u2067${to}\u2069` : `${from} – ${to}`;
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

/** A booking's status, as staff and customers read it, with its badge tone. */
export const BOOKING_STATUS_TEXT: Record<BookingStatus, { ar: string; en: string; tone: string }> =
  {
    hold: { ar: "قيد الدفع", en: "Checking out", tone: "bg-info-subtle text-info" },
    requested: { ar: "طلب حجز", en: "Request", tone: "bg-warning-subtle text-warning" },
    confirmed: { ar: "مؤكد", en: "Confirmed", tone: "bg-success-subtle text-success" },
    completed: { ar: "منتهي", en: "Completed", tone: "bg-muted text-muted-foreground" },
    cancelled: { ar: "ملغي", en: "Cancelled", tone: "bg-destructive-subtle text-destructive" },
    expired: { ar: "منتهي الصلاحية", en: "Expired", tone: "bg-muted text-muted-foreground" },
  };

/** A booking's place: its area, venue, address, whatever it recorded. */
export function bookingPlaceText(location: unknown): string {
  if (!location || typeof location !== "object") return "";
  const values = Object.values(location as Record<string, unknown>).filter(
    (value): value is string => typeof value === "string" && value.trim() !== "",
  );
  return values.join("، ");
}
