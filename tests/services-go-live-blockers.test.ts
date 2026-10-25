import { describe, expect, it } from "vitest";
import { DEFAULT_BOOKING_RULES } from "../src/lib/bookings/rules";
import { storeDayLimitApplies } from "../src/lib/bookings/service-capacity";
import { summariseMonth } from "../src/features/bookings/lib/calendar-view";
import { stateLabel } from "../src/features/bookings/components/BookingsCalendar";
import { waitingCount, waitingOnStore } from "../src/features/bookings/lib/waiting-on-store";
import { orderLineName, serviceLengthLabel } from "../src/lib/order-line-name";
import {
  appointmentAddress,
  hasAddressDetails,
} from "../src/features/orders/lib/appointment-address";
import { bookingTotals } from "../src/features/storefront-booking/lib/booking-flow";
import { getFulfillmentMethodLabel } from "../src/lib/status-labels";
import { NO_TAX } from "../src/lib/order-tax";

// The services store's go-live blockers, found on Aurora on 2026-10-25: what the booking page
// charges, what a booking's order and invoice say, what the dashboard counts and when the
// calendar says a day is full.

describe("the booking page's total", () => {
  const amounts = { services: 55, options: 30, offer: 13.75, travelFee: 0 };

  it("is what checkout charges: VAT on the services and add-ons after the offer", () => {
    // Aurora's photobooth on 29 Oct: the page showed 71.250 and checkout charged 78.375.
    expect(bookingTotals(amounts, { rate: 10, inclusive: false })).toMatchObject({
      tax: 7.125,
      total: 78.375,
      added: true,
    });
  });

  it("adds nothing for a store with no VAT, and never taxes the travel fee", () => {
    expect(bookingTotals(amounts, NO_TAX).total).toBe(71.25);
    expect(
      bookingTotals({ ...amounts, travelFee: 5 }, { rate: 10, inclusive: false }),
    ).toMatchObject({ tax: 7.125, total: 83.375 });
  });

  it("keeps the total of a store whose prices include VAT, and says the VAT in it", () => {
    expect(bookingTotals(amounts, { rate: 10, inclusive: true })).toMatchObject({
      tax: 6.477,
      total: 71.25,
      added: false,
    });
  });
});

describe("an order line's name in the reader's language", () => {
  const booth = { name: "photobooth", name_ar: "فوتوبوث", name_en: "photobooth" };

  it("names a booking's add-on and extra time by their own names", () => {
    const addOn = {
      description: "+ Instant prints",
      name_ar: "+ طباعة فورية",
      name_en: "+ Instant prints",
    };
    expect(orderLineName(addOn, "ar")).toBe("+ طباعة فورية");
    expect(orderLineName(addOn, "en")).toBe("+ Instant prints");
  });

  it("names a line written as its product's name by the product, in that language", () => {
    expect(orderLineName({ description: "photobooth", products: booth }, "ar")).toBe("فوتوبوث");
    expect(orderLineName({ description: "photobooth", product: booth }, "en")).toBe("photobooth");
    expect(orderLineName({ description: "", products: booth }, "ar")).toBe("فوتوبوث");
  });

  it("keeps what a person wrote, and a line written before the names (its text)", () => {
    const abaya = { name: "Abaya | Sahab", name_ar: "عباية | سَحاب", name_en: "Abaya | Sahab" };
    expect(orderLineName({ description: "Abaya - Code SS7", products: abaya }, "ar")).toBe(
      "Abaya - Code SS7",
    );
    expect(orderLineName({ description: "+ Envelopes × 100" }, "ar")).toBe("+ Envelopes × 100");
  });

  it("says a booked service's length in the reader's language", () => {
    expect(serviceLengthLabel({ duration_minutes: 180 }, "ar")).toBe("3 ساعات");
    expect(serviceLengthLabel({ duration_minutes: 180 }, "en")).toBe("3 hours");
    expect(serviceLengthLabel({ duration_minutes: null }, "ar")).toBeNull();
    expect(serviceLengthLabel(null, "ar")).toBeNull();
  });
});

describe("a booking's order", () => {
  it("names its method, never the raw code", () => {
    expect(getFulfillmentMethodLabel("appointment", "ar")).toBe("موعد خدمة");
    expect(getFulfillmentMethodLabel("appointment", "en")).toBe("Service appointment");
  });

  it("shows the booking's place when the order carries no address", () => {
    const place = { area: "القضيبية", venue: "نسيج" };
    const customerOnly = { name: "Sara", phone: "39990017" };
    expect(hasAddressDetails(customerOnly)).toBe(false);
    expect(appointmentAddress(customerOnly, place)).toMatchObject({
      name: "Sara",
      formatted_address: "القضيبية، نسيج",
    });
    expect(appointmentAddress(null, place)).toEqual({ formatted_address: "القضيبية، نسيج" });
  });

  it("keeps an address the order does carry, and shows nothing it does not know", () => {
    const saved = { region: "manama", block: "317" };
    expect(appointmentAddress(saved, { area: "القضيبية" })).toBe(saved);
    expect(appointmentAddress(null, null)).toBeNull();
  });
});

describe("what waits for the store", () => {
  const order = (status: string) => ({
    id: "o",
    invoice_number: 1,
    public_invoice_token: null,
    status,
    payment_status: "unpaid",
    total: 10,
    advance_paid: 0,
    currency: "BHD",
  });

  it("is requests and transfers to check, never a hold that ran out", () => {
    const bookings = [
      { status: "requested" },
      // Aurora's hold for 19 Oct, never paid: the dashboard counted it as a request.
      { status: "hold", orders: null },
      { status: "hold", orders: [order("pending_verification")] },
      { status: "hold", orders: [order("pending")] },
      { status: "confirmed" },
    ];
    const waiting = waitingOnStore(bookings);
    expect(waiting.requests).toHaveLength(1);
    expect(waiting.toVerify).toHaveLength(1);
    expect(waitingCount(bookings)).toBe(2);
    expect(waitingCount([{ status: "hold", orders: null }])).toBe(0);
  });
});

describe("a full day in the admin calendar", () => {
  const service = (capacity: number | null, rest = {}) => ({
    item_kind: "service",
    is_active: true,
    booking_capacity: capacity,
    ...rest,
  });

  it("is the store's to decide only while a service has no capacity of its own", () => {
    expect(storeDayLimitApplies([service(1), service(1)])).toBe(false);
    expect(storeDayLimitApplies([service(1), service(null)])).toBe(true);
    // A hidden service or a product does not book.
    expect(storeDayLimitApplies([service(1), service(null, { is_active: false })])).toBe(false);
    expect(storeDayLimitApplies([service(1), service(null, { item_kind: "product" })])).toBe(false);
    expect(storeDayLimitApplies([])).toBe(true);
  });

  it("is not full by the store's count when every service has its own capacity", () => {
    const month = (storeLimit: boolean) =>
      summariseMonth({
        year: 2026,
        month: 10,
        weekStartsOn: 0,
        rules: { ...DEFAULT_BOOKING_RULES, daily_capacity: 1 },
        today: "2026-10-25",
        now: new Date("2026-10-25T09:00:00Z"),
        blocks: [],
        bookings: [{ id: "a", event_date: "2026-10-29", status: "confirmed" }],
        storeLimit,
      })
        .flat()
        .find((cell) => cell.day === "2026-10-29")!;

    expect(month(true)).toMatchObject({ state: "full", taken: 1, capacity: 1 });
    const ownCapacity = month(false);
    expect(ownCapacity).toMatchObject({ state: "available", taken: 1, capacity: null });
    expect(stateLabel(ownCapacity, true)).toBe("حجز واحد");
    expect(stateLabel(ownCapacity, false)).toBe("1 booked");
  });
});
