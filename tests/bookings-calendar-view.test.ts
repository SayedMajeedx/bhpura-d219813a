import { describe, expect, it } from "vitest";
import { DEFAULT_BOOKING_RULES } from "../src/lib/bookings/rules";
import { summariseMonth } from "../src/features/bookings/lib/calendar-view";
import {
  formatClock,
  formatDuration,
  gridRange,
  localTime,
  shiftMonth,
  weekdayNames,
} from "../src/lib/bookings/format";
import {
  bookingLines,
  bookingTotal,
  formProblems,
  listedPrice,
  toStaffBooking,
  type NewBookingForm,
} from "../src/features/bookings/lib/new-booking";
import { rulesProblem } from "../src/features/bookings/components/BookingRulesDialog";

const rules = { ...DEFAULT_BOOKING_RULES, daily_capacity: 2, closed_weekdays: [5] };
const now = new Date("2026-10-01T09:00:00Z");

describe("the admin month", () => {
  const cells = summariseMonth({
    year: 2026,
    month: 10,
    weekStartsOn: 0,
    rules,
    today: "2026-10-01",
    now,
    blocks: [{ starts_on: "2026-10-20", ends_on: "2026-10-21" }],
    bookings: [
      { id: "a", event_date: "2026-10-10", status: "confirmed" },
      { id: "b", event_date: "2026-10-10", status: "confirmed" },
      { id: "c", event_date: "2026-10-12", status: "confirmed" },
      { id: "d", event_date: "2026-10-12", status: "requested" },
      {
        id: "e",
        event_date: "2026-10-13",
        status: "hold",
        hold_expires_at: "2026-10-01T08:00:00Z",
      },
      { id: "f", event_date: "2026-10-14", status: "cancelled" },
      {
        id: "g",
        event_date: "2026-10-15",
        status: "hold",
        hold_expires_at: "2026-10-01T09:30:00Z",
      },
    ],
  }).flat();
  const cell = (day: string) => cells.find((c) => c.day === day)!;

  it("marks full, part-booked, blocked and closed days for staff", () => {
    expect(cell("2026-10-10")).toMatchObject({ state: "full", taken: 2 });
    expect(cell("2026-10-12")).toMatchObject({ state: "available", taken: 1, requests: 1 });
    expect(cell("2026-10-20")).toMatchObject({ state: "blocked", blocked: true });
    expect(cell("2026-10-02").state).toBe("closed"); // a Friday
  });

  it("frees days held by an expired checkout or a cancelled booking", () => {
    expect(cell("2026-10-13")).toMatchObject({ state: "available", taken: 0 });
    expect(cell("2026-10-14")).toMatchObject({ state: "available", taken: 0 });
  });

  it("shows today and the days behind it, which staff may still book", () => {
    expect(cell("2026-10-01")).toMatchObject({ isToday: true, isPast: false, state: "available" });
    expect(cell("2026-09-30")).toMatchObject({ isPast: true, inMonth: false });
  });

  it("walks months and the grid's first and last day", () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(gridRange(2026, 10, 0)).toEqual({ from: "2026-09-27", to: "2026-10-31" });
  });

  it("counts what waits for the store apart from what it confirmed", () => {
    // A request and a live hold wait; an expired hold, a cancelled booking and a confirmed one do not.
    expect(cell("2026-10-12")).toMatchObject({ pending: 1, confirmed: 1 });
    expect(cell("2026-10-13")).toMatchObject({ pending: 0, confirmed: 0 });
    expect(cell("2026-10-14")).toMatchObject({ pending: 0, confirmed: 0 });
    expect(cell("2026-10-15")).toMatchObject({ pending: 1, confirmed: 0 });
    expect(cell("2026-10-10")).toMatchObject({ pending: 0, confirmed: 2 });
  });
});

describe("times and words", () => {
  it("shows a booking's start in the store's own timezone", () => {
    expect(localTime("2026-10-10T15:00:00Z", "Asia/Bahrain")).toBe("18:00");
  });

  it("reads clock times and durations in both languages", () => {
    expect(formatClock("18:30", false)).toBe("6:30 PM");
    expect(formatClock("00:00", true)).toBe("12:00 ص");
    expect(formatClock("12:00", true)).toBe("12:00 م");
    expect(formatDuration(240, false)).toBe("4 hours");
    expect(formatDuration(120, true)).toBe("ساعتان");
    expect(formatDuration(180, true)).toBe("3 ساعات");
    expect(formatDuration(90, false)).toBe("90 min");
    expect(weekdayNames(false, 6)[0]).toBe("Sat");
  });
});

describe("the new booking form", () => {
  const products = [
    {
      id: "p1",
      name: "Photo booth",
      name_en: "Photo booth",
      name_ar: "فوتوبوث",
      base_price: 55,
      is_active: true,
    },
    { id: "p2", name: "Prints", name_en: null, name_ar: null, base_price: 35, is_active: true },
  ];
  const form: NewBookingForm = {
    day: "2026-10-12",
    start: "18:00",
    durationMinutes: 240,
    customerName: " Sara ",
    customerPhone: "",
    area: "Juffair",
    venue: "",
    notes: "",
    status: "confirmed",
    source: "whatsapp",
    allowOverbook: false,
    services: { p2: { quantity: 2, unit_price: 30 }, p1: { quantity: 1, unit_price: 55 } },
  };

  it("books the chosen services at their agreed prices, in catalog order", () => {
    const lines = bookingLines(form.services, products);
    expect(lines.map((line) => line.product_id)).toEqual(["p1", "p2"]);
    expect(lines[1]).toMatchObject({ name_en: "Prints", name_ar: "Prints", unit_price: 30 });
    expect(bookingTotal(lines)).toBe(115);
  });

  it("says what is missing before it can be saved", () => {
    const lines = bookingLines(form.services, products);
    expect(formProblems(form, DEFAULT_BOOKING_RULES, lines)).toEqual([]);
    expect(formProblems({ ...form, start: "09:00" }, DEFAULT_BOOKING_RULES, lines)).toContain(
      "slot",
    );
    expect(formProblems({ ...form, customerName: "" }, DEFAULT_BOOKING_RULES, lines)).toContain(
      "customer",
    );
    expect(formProblems(form, DEFAULT_BOOKING_RULES, [])).toContain("services");
  });

  it("prices a service from its cheapest variant, as the storefront does", () => {
    const withVariants = {
      ...products[0],
      base_price: null,
      variants: [
        { id: "v2", selling_price: 70 },
        { id: "v1", selling_price: 55 },
      ],
    };
    expect(listedPrice(withVariants)).toBe(55);
    expect(bookingLines({ p1: { quantity: 1, unit_price: 55 } }, [withVariants])[0]).toMatchObject({
      variant_id: "v1",
    });
    expect(listedPrice(products[1])).toBe(35);
  });

  it("sends the database what it takes", () => {
    const request = toStaffBooking("brand-1", form, bookingLines(form.services, products));
    expect(request).toMatchObject({
      brandId: "brand-1",
      day: "2026-10-12",
      start: "18:00",
      durationMinutes: 240,
      customer: { name: "Sara", phone: undefined },
      location: { area: "Juffair" },
      source: "whatsapp",
      status: "confirmed",
      allowOverbook: false,
    });
  });

  it("checks booking rules before saving them", () => {
    expect(rulesProblem(DEFAULT_BOOKING_RULES, false)).toBeNull();
    expect(rulesProblem({ ...DEFAULT_BOOKING_RULES, last_start_time: "09:00" }, false)).toMatch(
      /last start/,
    );
    expect(rulesProblem({ ...DEFAULT_BOOKING_RULES, max_duration_minutes: 60 }, false)).toMatch(
      /longest/,
    );
  });
});
