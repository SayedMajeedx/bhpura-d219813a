/**
 * Bookings in the merchant app: dates and times in the store's timezone and
 * the database's refusals in words. The rules themselves live in the
 * database (set_booking_status checks a day still has a place).
 */

/** Today in the store's timezone, "2026-10-01". */
export function todayIn(timezone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** An ISO day moved by `days`. */
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** "6:00 PM" / "6:00 م" for an instant, in the store's timezone. */
export function clockAt(iso: string, timezone: string, isAr: boolean): string {
  const [hours, minutes] = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(new Date(iso))
    .split(":")
    .map(Number);
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  const suffix = hours < 12 ? (isAr ? "ص" : "AM") : isAr ? "م" : "PM";
  return `${hour12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

/** "Saturday 10 October" / "السبت 10 أكتوبر". */
export function dayTitle(day: string, isAr: boolean): string {
  return new Intl.DateTimeFormat(isAr ? "ar-u-nu-latn" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}

/** Bookings grouped by their day, days in order. */
export function byDay<T extends { event_date: string }>(bookings: readonly T[]) {
  const groups = new Map<string, T[]>();
  for (const booking of bookings) {
    groups.set(booking.event_date, [...(groups.get(booking.event_date) ?? []), booking]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

/** The place a booking recorded, "Villa 12, Juffair". */
export function placeOf(location: unknown): string {
  if (!location || typeof location !== "object") return "";
  const { venue, area } = location as { venue?: unknown; area?: unknown };
  return [venue, area]
    .filter((part): part is string => typeof part === "string" && part !== "")
    .join(", ");
}

/** Digits for tel: and wa.me links (Bahrain numbers get 973). */
export function phoneDigits(raw: string | null | undefined): string {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 8 && /^[36]|^17/.test(digits)) digits = `973${digits}`;
  return digits;
}

/** How long a service runs: "3 h", "1 h 30 min", "45 min" / "3 ساعات", "ساعة ونصف". */
export function durationText(minutes: number, isAr: boolean): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (isAr) {
    const hoursAr =
      hours === 0
        ? ""
        : hours === 1
          ? "ساعة"
          : hours === 2
            ? "ساعتان"
            : hours <= 10
              ? `${hours} ساعات`
              : `${hours} ساعة`;
    const restAr = rest === 0 ? "" : `${rest} دقيقة`;
    return [hoursAr, restAr].filter(Boolean).join(" و");
  }
  return [hours > 0 ? `${hours} h` : "", rest > 0 ? `${rest} min` : ""].filter(Boolean).join(" ");
}
