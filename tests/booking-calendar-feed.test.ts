import { describe, expect, it, vi } from "vitest";
import {
  bookingsIcs,
  calendarFeedUrl,
  feedToken,
  foldLine,
  icsInstant,
  icsText,
} from "../src/lib/bookings/ics";
import { calendarFeedFor } from "../src/lib/bookings/calendar-feed.server";

// Made at run time: a literal would look like a leaked secret to the scanner.
const TOKEN = crypto.randomUUID();
const booking = {
  id: "bk-1",
  reference: "BK-7Q2X9A",
  status: "confirmed",
  starts_at: "2026-10-10T15:00:00Z",
  ends_at: "2026-10-10T19:00:00Z",
  customer_name: "Sara",
  customer_phone: "39001122",
  location: { area: "Juffair", venue: "Villa 12, Road 4" },
  notes: "Gate code; 1234",
  updated_at: "2026-10-01T08:00:00Z",
  services: ["Photo booth", "Prints"],
};

describe("the calendar feed", () => {
  it("writes an event per booking in UTC, escaped as the format needs", () => {
    const ics = bookingsIcs({ calendarName: "Aurora · Bookings", bookings: [booking] });
    const lines = ics.split("\r\n");
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(lines).toContain("UID:bk-1@bookings.boutq.store");
    expect(lines).toContain("DTSTART:20261010T150000Z");
    expect(lines).toContain("DTEND:20261010T190000Z");
    expect(lines).toContain("SUMMARY:Photo booth + Prints · Sara");
    expect(lines).toContain("LOCATION:Villa 12\\, Road 4\\, Juffair");
    expect(lines).toContain("DESCRIPTION:BK-7Q2X9A\\nTel: 39001122\\nGate code\\; 1234");
    expect(lines).toContain("STATUS:CONFIRMED");
  });

  it("escapes and folds long lines, Arabic included", () => {
    expect(icsText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
    expect(icsInstant("2026-10-10T15:00:00.000Z")).toBe("20261010T150000Z");
    const long = "SUMMARY:" + "فوتوبوث ".repeat(20);
    const folded = foldLine(long).split("\r\n");
    expect(folded.length).toBeGreaterThan(1);
    for (const part of folded)
      expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    expect(folded.slice(1).every((part) => part.startsWith(" "))).toBe(true);
    expect(folded.map((part, i) => (i === 0 ? part : part.slice(1))).join("")).toBe(long);
  });

  it("takes only a real token from the path", () => {
    expect(feedToken(`${TOKEN}.ics`)).toBe(TOKEN);
    expect(feedToken(TOKEN.toUpperCase())).toBe(TOKEN);
    expect(feedToken("nope.ics")).toBeNull();
    expect(feedToken(undefined)).toBeNull();
    expect(calendarFeedUrl("https://aurora.boutq.store", TOKEN)).toBe(
      `https://aurora.boutq.store/api/public/bookings/calendar/${TOKEN}.ics`,
    );
  });

  it("reads the store's feed for its token, or nothing for another", async () => {
    const rpc = vi.fn(async (_name: string, args: { p_token: string }) => ({
      data:
        args.p_token === TOKEN
          ? { brand_name_en: "Aurora", brand_name_ar: "أورورا", bookings: [booking] }
          : null,
      error: null,
    }));
    const admin = { rpc } as never;
    const ics = await calendarFeedFor(admin, TOKEN);
    expect(rpc).toHaveBeenCalledWith("booking_calendar_feed", { p_token: TOKEN });
    expect(ics).toContain("X-WR-CALNAME:Aurora · Bookings");
    expect(ics).toContain("UID:bk-1@bookings.boutq.store");
    expect(await calendarFeedFor(admin, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});
