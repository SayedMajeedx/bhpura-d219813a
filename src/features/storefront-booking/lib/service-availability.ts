import type { DayState } from "@/lib/bookings/rules";

/**
 * What the storefront learns from the booking engine about the services a
 * customer chose (get_service_availability, get_service_free_starts), as pure
 * rules: one calendar out of each service's days, and the start times that
 * are still free.
 */

export type ServiceDayRow = {
  product_id: string;
  day: string;
  state: string;
  remaining: number | null;
};

export type StartRow = { start_time: string; free: boolean; reason: string | null };

/** The states a day can be in, most blocking first: the one shown when services disagree. */
const BLOCKING_ORDER: DayState[] = ["closed", "blocked", "past", "beyond", "full"];

const isDayState = (state: string): state is DayState =>
  state === "available" || (BLOCKING_ORDER as string[]).includes(state);

/**
 * One state per day for a booking of all the chosen services: a day is
 * available only when every one of them is, and otherwise shows the most
 * blocking reason. A service the store no longer offers has no rows and does
 * not block (the booking itself refuses it).
 */
export function combineServiceDays(rows: readonly ServiceDayRow[]): Map<string, DayState> {
  const byDay = new Map<string, DayState[]>();
  for (const row of rows) {
    if (!isDayState(row.state)) continue;
    byDay.set(row.day, [...(byDay.get(row.day) ?? []), row.state]);
  }
  const combined = new Map<string, DayState>();
  for (const [day, states] of byDay) {
    const blocking = BLOCKING_ORDER.find((state) => states.includes(state));
    combined.set(day, blocking ?? "available");
  }
  return combined;
}

/** The start times ("HH:MM") a booking of the chosen services can begin at. */
export function freeStartSet(rows: readonly StartRow[] | undefined): Set<string> | null {
  return rows ? new Set(rows.filter((row) => row.free).map((row) => row.start_time)) : null;
}

/** Why a start time is not free, for the time picker's hint. */
export function startBlockedReason(
  rows: readonly StartRow[] | undefined,
  start: string,
): StartRow["reason"] {
  return rows?.find((row) => row.start_time === start && !row.free)?.reason ?? null;
}

/** The customer's wording for why a day or time cannot be chosen. */
export function blockedReasonText(reason: string | null, isAr: boolean): string {
  switch (reason) {
    case "taken":
      return isAr ? "محجوز" : "Booked";
    case "notice":
      return isAr ? "يحتاج إشعاراً أطول" : "Needs more notice";
    case "full":
      return isAr ? "مكتمل" : "Full";
    case "closed":
    case "blocked":
      return isAr ? "مغلق" : "Closed";
    default:
      return isAr ? "غير متاح" : "Unavailable";
  }
}
