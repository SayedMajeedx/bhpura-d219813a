/**
 * A store's bookings as an iCalendar feed (RFC 5545) that Google, Apple and
 * Outlook calendars subscribe to. Pure: the server route reads the bookings
 * and returns what this builds.
 */

export type FeedBooking = {
  id: string;
  reference: string;
  status: string;
  starts_at: string;
  ends_at: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  location?: Record<string, unknown> | null;
  notes?: string | null;
  updated_at?: string | null;
  services?: readonly string[] | null;
};

/** Escapes a text value (backslash, semicolon, comma, newline). */
export function icsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** An instant as UTC in iCalendar form, 20261010T150000Z. */
export function icsInstant(iso: string): string {
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

/** Folds a content line to 75 octets, continuing lines with a space. */
export function foldLine(line: string): string {
  const bytes = new TextEncoder();
  const parts: string[] = [];
  let current = "";
  for (const char of line) {
    const limit = parts.length === 0 ? 75 : 74; // continuation lines start with a space
    if (bytes.encode(current + char).length > limit) {
      parts.push(current);
      current = char;
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts.join("\r\n ");
}

function placeOf(location: FeedBooking["location"]): string {
  if (!location || typeof location !== "object") return "";
  const area = typeof location.area === "string" ? location.area : "";
  const venue = typeof location.venue === "string" ? location.venue : "";
  return [venue, area].filter(Boolean).join(", ");
}

export function bookingsIcs({
  calendarName,
  bookings,
  now = new Date(),
}: {
  calendarName: string;
  bookings: readonly FeedBooking[];
  now?: Date;
}): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Boutq//Bookings//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsText(calendarName)}`,
    "X-PUBLISHED-TTL:PT15M",
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
  ];
  for (const booking of bookings) {
    const services = (booking.services ?? []).filter(Boolean).join(" + ");
    const summary = [services || "Booking", booking.customer_name].filter(Boolean).join(" · ");
    const description = [
      booking.reference,
      booking.customer_phone ? `Tel: ${booking.customer_phone}` : "",
      booking.notes ?? "",
    ]
      .filter(Boolean)
      .join("\n");
    const place = placeOf(booking.location);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${booking.id}@bookings.boutq.store`,
      `DTSTAMP:${icsInstant(booking.updated_at ?? now.toISOString())}`,
      `DTSTART:${icsInstant(booking.starts_at)}`,
      `DTEND:${icsInstant(booking.ends_at)}`,
      `SUMMARY:${icsText(summary)}`,
      ...(place ? [`LOCATION:${icsText(place)}`] : []),
      `DESCRIPTION:${icsText(description)}`,
      "STATUS:CONFIRMED",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** The address calendar apps subscribe to for a token. */
export function calendarFeedUrl(origin: string, token: string): string {
  return `${origin}/api/public/bookings/calendar/${token}.ics`;
}

/** The token in a feed path, "<uuid>" or "<uuid>.ics"; null when it is not one. */
export function feedToken(raw: string | undefined | null): string | null {
  const token = String(raw ?? "").replace(/\.ics$/i, "");
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)
    ? token.toLowerCase()
    : null;
}
