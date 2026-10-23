import { foldLine, icsInstant, icsText } from "@/lib/bookings/ics";

/**
 * A shopper's booking as one event for their own calendar: a file Apple and
 * Outlook calendars open (RFC 5545) and a link that opens Google Calendar with
 * the event filled in. The booking's day and start are the store's local time,
 * so the event is placed at the instant they mean in the store's time zone,
 * wherever the shopper's phone is.
 */

export type CalendarEvent = {
  /** Unique per booking, so adding it twice updates the same event. */
  uid: string;
  title: string;
  /** ISO instants. */
  start: string;
  end: string;
  location?: string | null;
  details?: string | null;
};

/** The instant a wall-clock day and time ("2026-10-25", "18:00") mean in a time zone, as ISO. */
export function zonedInstant(day: string, time: string, timezone: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const asUtc = Date.UTC(y, m - 1, d, hh, mm);
  // What that UTC instant reads as on the zone's clock; the difference is the zone's offset.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(asUtc));
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const zoneReads = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
  );
  return new Date(asUtc - (zoneReads - asUtc)).toISOString();
}

/** A booking as an event: "Photo booth · Aurora", at its place, with its reference. */
export function bookingEvent(input: {
  reference: string;
  day: string;
  start: string;
  minutes: number;
  timezone: string;
  storeName: string;
  services?: readonly string[];
  place?: string | null;
  link?: string | null;
  isAr: boolean;
}): CalendarEvent {
  const start = zonedInstant(input.day, input.start, input.timezone);
  const end = new Date(Date.parse(start) + input.minutes * 60_000).toISOString();
  const what = input.services?.filter(Boolean).join(input.isAr ? "، " : ", ");
  const title = what ? `${what} · ${input.storeName}` : input.storeName;
  const details = [
    `${input.isAr ? "رقم الحجز" : "Booking reference"}: ${input.reference}`,
    input.link ?? "",
  ]
    .filter(Boolean)
    .join("\n");
  return {
    uid: `${input.reference}@boutq.store`,
    title,
    start,
    end,
    location: input.place || null,
    details,
  };
}

/** The event as an iCalendar file's text. */
export function eventIcs(event: CalendarEvent, now: Date = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Boutq//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${icsText(event.uid)}`,
    `DTSTAMP:${icsInstant(now.toISOString())}`,
    `DTSTART:${icsInstant(event.start)}`,
    `DTEND:${icsInstant(event.end)}`,
    `SUMMARY:${icsText(event.title)}`,
    event.location ? `LOCATION:${icsText(event.location)}` : "",
    event.details ? `DESCRIPTION:${icsText(event.details)}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

/** A link that opens Google Calendar with the event filled in. */
export function googleCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${icsInstant(event.start)}/${icsInstant(event.end)}`,
  });
  if (event.location) params.set("location", event.location);
  if (event.details) params.set("details", event.details);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** The file to download, as a link an anchor can carry (no object URL to revoke). */
export function icsDataUrl(event: CalendarEvent, now: Date = new Date()): string {
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(eventIcs(event, now))}`;
}

/** "BK-AB12.ics". */
export const icsFileName = (reference: string) =>
  `${reference.replace(/[^A-Za-z0-9-]/g, "") || "booking"}.ics`;
