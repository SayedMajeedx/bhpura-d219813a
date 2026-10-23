import { describe, expect, it } from "vitest";
import {
  bookingEvent,
  eventIcs,
  googleCalendarUrl,
  icsDataUrl,
  icsFileName,
  zonedInstant,
} from "../src/lib/bookings/add-to-calendar";
import {
  ownBookingBalance,
  ownBookingEvent,
  ownBookingServices,
  shopperBookingStatus,
  splitOwnBookings,
  type OwnBooking,
} from "../src/features/storefront-account/lib/own-bookings";

// A booking in the shopper's own calendar, and their bookings on their account: pure rules.

describe("a booking in the shopper's calendar", () => {
  it("is placed at the instant the store's clock means, whatever zone the phone is in", () => {
    expect(zonedInstant("2026-10-25", "18:00", "Asia/Bahrain")).toBe("2026-10-25T15:00:00.000Z");
    expect(zonedInstant("2026-10-25", "00:30", "Asia/Riyadh")).toBe("2026-10-24T21:30:00.000Z");
    // A zone with summer time: London is on GMT on 1 November, on BST in July.
    expect(zonedInstant("2026-11-01", "10:00", "Europe/London")).toBe("2026-11-01T10:00:00.000Z");
    expect(zonedInstant("2026-07-01", "10:00", "Europe/London")).toBe("2026-07-01T09:00:00.000Z");
  });

  const event = bookingEvent({
    reference: "BK-AB12",
    day: "2026-10-25",
    start: "18:00",
    minutes: 180,
    timezone: "Asia/Bahrain",
    storeName: "Aurora",
    services: ["Photo booth", "Video booth"],
    place: "Juffair, Gold hall",
    link: "https://aurora.boutq.store/invoice/tok",
    isAr: false,
  });

  it("names what was booked and with whom, where, with the reference and the invoice", () => {
    expect(event).toEqual({
      uid: "BK-AB12@boutq.store",
      title: "Photo booth, Video booth · Aurora",
      start: "2026-10-25T15:00:00.000Z",
      end: "2026-10-25T18:00:00.000Z",
      location: "Juffair, Gold hall",
      details: "Booking reference: BK-AB12\nhttps://aurora.boutq.store/invoice/tok",
    });
  });

  it("is a calendar file Apple and Outlook open", () => {
    const ics = eventIcs(event, new Date("2026-10-23T10:00:00Z"));
    expect(ics.split("\r\n")).toEqual([
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Boutq//Booking//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      "UID:BK-AB12@boutq.store",
      "DTSTAMP:20261023T100000Z",
      "DTSTART:20261025T150000Z",
      "DTEND:20261025T180000Z",
      "SUMMARY:Photo booth\\, Video booth · Aurora",
      "LOCATION:Juffair\\, Gold hall",
      // Folded at 75 octets, the rest on a line starting with a space.
      "DESCRIPTION:Booking reference: BK-AB12\\nhttps://aurora.boutq.store/invoice/",
      " tok",
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ]);
    expect(icsDataUrl(event).startsWith("data:text/calendar;charset=utf-8,BEGIN%3AVCALENDAR")).toBe(
      true,
    );
    expect(icsFileName("BK-AB12")).toBe("BK-AB12.ics");
    expect(icsFileName("../")).toBe("booking.ics");
  });

  it("opens Google Calendar with the event filled in", () => {
    const url = new URL(googleCalendarUrl(event));
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      action: "TEMPLATE",
      text: "Photo booth, Video booth · Aurora",
      dates: "20261025T150000Z/20261025T180000Z",
      location: "Juffair, Gold hall",
      details: "Booking reference: BK-AB12\nhttps://aurora.boutq.store/invoice/tok",
    });
  });

  it("is written in Arabic for an Arabic reader", () => {
    const ar = bookingEvent({
      reference: "BK-AB12",
      day: "2026-10-25",
      start: "18:00",
      minutes: 60,
      timezone: "Asia/Bahrain",
      storeName: "اورورا",
      services: ["فوتوبوث", "فيديو بوث"],
      isAr: true,
    });
    expect(ar.title).toBe("فوتوبوث، فيديو بوث · اورورا");
    expect(ar.details).toBe("رقم الحجز: BK-AB12");
    expect(ar.location).toBeNull();
  });
});

describe("a shopper's bookings on their account", () => {
  const booking = (over: Partial<OwnBooking>): OwnBooking => ({
    reference: "BK-1",
    status: "confirmed",
    event_date: "2026-10-25",
    starts_at: "2026-10-25T15:00:00Z",
    ends_at: "2026-10-25T18:00:00Z",
    timezone: "Asia/Bahrain",
    location: { area: "Juffair" },
    services: [{ name_en: "Photo booth", name_ar: "فوتوبوث", quantity: 1 }],
    invoice_token: "tok",
    total: 100,
    paid: 37.5,
    currency: "BHD",
    ...over,
  });
  const now = new Date("2026-10-23T09:00:00Z");

  it("are read in a customer's words", () => {
    expect(shopperBookingStatus("confirmed", false).label).toBe("Confirmed");
    expect(shopperBookingStatus("requested", false).label).toBe("Waiting for the store");
    expect(shopperBookingStatus("hold", false).label).toBe("Payment being checked");
    expect(shopperBookingStatus("completed", true).label).toBe("تم");
    expect(shopperBookingStatus("cancelled", true)).toEqual({ label: "ملغي", tone: "destructive" });
  });

  it("list what is still to come soonest first, and the rest latest first", () => {
    const { upcoming, past } = splitOwnBookings(
      [
        booking({
          reference: "later",
          starts_at: "2026-11-02T15:00:00Z",
          ends_at: "2026-11-02T18:00:00Z",
        }),
        booking({ reference: "soon" }),
        booking({ reference: "off", status: "cancelled", starts_at: "2026-11-05T15:00:00Z" }),
        booking({ reference: "done", status: "completed", starts_at: "2026-10-10T15:00:00Z" }),
        booking({
          reference: "over",
          starts_at: "2026-10-20T15:00:00Z",
          ends_at: "2026-10-20T18:00:00Z",
        }),
      ],
      now,
    );
    expect(upcoming.map((b) => b.reference)).toEqual(["soon", "later"]);
    expect(past.map((b) => b.reference)).toEqual(["off", "over", "done"]);
  });

  it("say what is still to pay and what was booked", () => {
    expect(ownBookingBalance(booking({}))).toBe(62.5);
    expect(ownBookingBalance(booking({ paid: 100 }))).toBe(0);
    expect(
      ownBookingServices(
        booking({
          services: [
            { name_en: "Photo booth", name_ar: null, quantity: 2 },
            { name_en: null, name_ar: null, quantity: 1 },
          ],
        }),
        true,
      ),
    ).toEqual(["Photo booth × 2"]);
  });

  it("go to the calendar at the store's time, for the booked length", () => {
    const event = ownBookingEvent(booking({}), {
      storeName: "Aurora",
      place: "Juffair",
      link: null,
      isAr: false,
    });
    expect(event).toMatchObject({
      title: "Photo booth · Aurora",
      start: "2026-10-25T15:00:00.000Z",
      end: "2026-10-25T18:00:00.000Z",
      location: "Juffair",
    });
  });
});
