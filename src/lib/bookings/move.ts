/**
 * Moving a booking to another date (reschedule_booking): pure rules for the
 * move dialog. A booking keeps its length when it moves, because its price
 * was set for that length; only the day and the start change.
 */

/** A booking's length in minutes, from its start and end. */
export function bookingMinutes(booking: { starts_at: string; ends_at: string }): number {
  return Math.round((Date.parse(booking.ends_at) - Date.parse(booking.starts_at)) / 60_000);
}

/**
 * The line an order carries for the booking it pays for, as place_booking_order
 * writes it: "📅 BK-ABC123 · 2026-10-08 · 18:00–21:00".
 */
export function bookingNoteLine(reference: string, day: string, start: string, end: string) {
  return `📅 ${reference} · ${day} · ${start}–${end}`;
}

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The order's notes with the booking's line moved to its new day and time, or
 * null when the notes carry no line for it (nothing to change). The invoice
 * prints the notes, so a moved booking's old date must not stay in them.
 */
export function movedOrderNotes(
  notes: string | null | undefined,
  reference: string,
  line: string,
): string | null {
  if (!notes) return null;
  const pattern = new RegExp(`^📅 ${escaped(reference)} · .*$`, "m");
  if (!pattern.test(notes)) return null;
  const next = notes.replace(pattern, line);
  return next === notes ? null : next;
}

/**
 * The last day the store's terms let a customer move a booking to
 * (`booking_policies.reschedule_months` after its original day), when the new
 * day is past it; null when it is within the terms or there are none. Staff may
 * still move it: the dialog only says so.
 */
export function pastMoveTerms(
  originalDay: string,
  newDay: string,
  months: number | null | undefined,
): string | null {
  if (!months || months <= 0) return null;
  const date = new Date(`${originalDay}T00:00:00Z`);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastOfMonth = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day, lastOfMonth));
  const limit = date.toISOString().slice(0, 10);
  return newDay > limit ? limit : null;
}

/**
 * Whether the database refused the move because the day or a service has no
 * place (staff may then move it anyway, as when taking a booking), not because
 * the day is past or out of the calendar.
 */
export function overbookable(message: string): boolean {
  return /BOOKING_SERVICE_FULL|BOOKING_DAY_(?!PAST|BEYOND)[A-Z_]+/.test(message);
}
