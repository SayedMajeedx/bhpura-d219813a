/**
 * A range of whole calendar days as the moments it covers.
 *
 * A screen's period is written in days (`YYYY-MM-DD`), read off the clock of whoever is looking,
 * and a row's time is a moment. Sending the day itself to the database compares it at midnight
 * UTC: in Bahrain (three hours ahead) an order placed between midnight and 03:00 on the 1st fell
 * in the month before. The reports send moments and their reader's time zone; this gives a plain
 * read the same bounds.
 */

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Midnight at the start of `day` on this device's clock, moved by whole days; null if not a day. */
export function startOfLocalDay(day: string, addDays = 0): Date | null {
  const match = DAY.exec(day.trim());
  if (!match) return null;
  const [, year, month, date] = match.map(Number);
  // Built from parts, so a day that is 23 or 25 hours long still begins at its own midnight.
  const start = new Date(year, month - 1, date + addDays);
  return Number.isNaN(start.getTime()) ? null : start;
}

/**
 * The moments a range of whole days covers: from the first day's midnight (`since`, included) to
 * the midnight after the last day (`before`, excluded). An empty bound is open.
 */
export function localDayRange(
  from: string,
  to: string,
): { since: string | null; before: string | null } {
  return {
    since: startOfLocalDay(from)?.toISOString() ?? null,
    before: startOfLocalDay(to, 1)?.toISOString() ?? null,
  };
}
