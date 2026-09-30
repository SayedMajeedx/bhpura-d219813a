import { describe, expect, it } from "vitest";
import { reportPeriod, summariseBookings } from "../src/features/bookings/lib/booking-report";

const booking = (over: Record<string, unknown>) => ({
  event_date: "2026-10-10",
  status: "confirmed",
  source: "storefront",
  total: 100,
  booking_items: [
    {
      product_id: "booth",
      name_en: "Photo booth",
      name_ar: "فوتوبوث",
      quantity: 1,
      line_total: 70,
    },
    { product_id: "prints", name_en: "Prints", name_ar: "طباعة", quantity: 1, line_total: 30 },
  ],
  ...over,
});

describe("the bookings report", () => {
  // October 2026: Fridays closed (5 of them), 20-21 blocked -> 31 - 5 - 2 = 24 bookable days.
  const report = summariseBookings({
    from: "2026-10-01",
    to: "2026-10-31",
    rules: { closed_weekdays: [5] },
    blocks: [{ starts_on: "2026-10-20", ends_on: "2026-10-21" }],
    bookings: [
      booking({}),
      booking({
        event_date: "2026-10-11",
        source: "whatsapp",
        total: 55,
        booking_items: [
          {
            product_id: "booth",
            name_en: "Photo booth",
            name_ar: "فوتوبوث",
            quantity: 1,
            line_total: 55,
          },
        ],
      }),
      booking({
        event_date: "2026-10-11",
        source: "admin",
        status: "completed",
        total: 45,
        booking_items: [],
      }),
      booking({ event_date: "2026-10-12", status: "cancelled" }),
      booking({ event_date: "2026-10-13", status: "requested", source: "whatsapp" }),
      booking({ event_date: "2026-10-14", status: "hold" }),
      booking({ event_date: "2026-11-02" }), // outside the period
    ],
  });

  it("measures how full the calendar was", () => {
    expect(report.bookableDays).toBe(24);
    expect(report.bookedDays).toBe(2);
    expect(report.occupancy).toBeCloseTo(2 / 24);
  });

  it("counts confirmed and completed bookings, their revenue and average", () => {
    expect(report.confirmed).toBe(3);
    expect(report.revenue).toBe(200);
    expect(report.averageValue).toBeCloseTo(66.667, 3);
    expect(report.cancelled).toBe(1);
  });

  it("measures how many customer requests became bookings", () => {
    // Customer requests: storefront and WhatsApp (not staff bookings), holds included.
    expect(report.requests).toBe(5);
    // Answered (not waiting): 2 confirmed + 1 cancelled -> 2 of 3.
    expect(report.requestConversion).toBeCloseTo(2 / 3);
  });

  it("shows where bookings came from, the top services and busy weekdays", () => {
    expect(report.bySource).toEqual({ storefront: 1, whatsapp: 1, admin: 1 });
    expect(report.topServices.map((s) => [s.key, s.count, s.revenue])).toEqual([
      ["booth", 2, 125],
      ["prints", 1, 30],
    ]);
    // 10 Oct 2026 is a Saturday, 11 Oct a Sunday.
    expect(report.byWeekday[6]).toBe(1);
    expect(report.byWeekday[0]).toBe(2);
  });

  it("is empty without bookings", () => {
    const empty = summariseBookings({
      from: "2026-10-01",
      to: "2026-10-07",
      rules: { closed_weekdays: [] },
      blocks: [],
      bookings: [],
    });
    expect(empty).toMatchObject({
      occupancy: 0,
      revenue: 0,
      averageValue: 0,
      requestConversion: 0,
    });
    expect(empty.bookableDays).toBe(7);
  });

  it("offers this month and the last 30 or 90 days", () => {
    expect(reportPeriod("month", "2026-10-14")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(reportPeriod("month", "2026-02-10")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(reportPeriod("last30", "2026-10-30")).toEqual({ from: "2026-10-01", to: "2026-10-30" });
    expect(reportPeriod("last90", "2026-10-30").from).toBe("2026-08-02");
  });
});
