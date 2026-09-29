import { describe, expect, it } from "vitest";
import { DEFAULT_BOOKING_RULES, type DayState } from "../src/lib/bookings/rules";
import {
  bookableServices,
  bookingWhatsAppText,
  cheapestVariant,
  chosenTotal,
  EMPTY_FLOW,
  fromPrice,
  missingStep,
  toBookingRequest,
  whatsAppLink,
  type FlowState,
} from "../src/features/storefront-booking/lib/booking-flow";

const booth = {
  id: "p1",
  name: "Photo booth",
  name_ar: "فوتوبوث",
  name_en: "Photo booth",
  image_url: null,
  product_variants: [
    { id: "v-big", selling_price: 70 },
    { id: "v-small", selling_price: 55 },
  ],
};
const prints = {
  ...booth,
  id: "p2",
  name: "Prints",
  name_ar: null,
  name_en: null,
  product_variants: [{ id: "v3", selling_price: 35 }],
};
const unpriced = { ...booth, id: "p3", product_variants: [] };

describe("services and prices", () => {
  it("books a service at its cheapest variant, the storefront's 'from' price", () => {
    expect(cheapestVariant(booth)?.id).toBe("v-small");
    expect(fromPrice(booth)).toBe(55);
    expect(fromPrice(unpriced)).toBeNull();
    expect(bookableServices([booth, unpriced, prints]).map((s) => s.id)).toEqual(["p1", "p2"]);
    expect(chosenTotal(["p1", "p2"], [booth, prints])).toBe(90);
  });
});

describe("the steps", () => {
  const states = new Map<string, DayState>([
    ["2026-10-10", "available"],
    ["2026-10-11", "full"],
  ]);
  const flow = (patch: Partial<FlowState>): FlowState => ({ ...EMPTY_FLOW, ...patch });

  it("asks for each step in order, and only an available day will do", () => {
    const rules = DEFAULT_BOOKING_RULES;
    expect(missingStep(flow({}), rules, states)).toBe("date");
    expect(missingStep(flow({ day: "2026-10-11" }), rules, states)).toBe("date");
    expect(missingStep(flow({ day: "2026-10-10" }), rules, states)).toBe("services");
    const chosen = { day: "2026-10-10", services: ["p1"] };
    expect(missingStep(flow(chosen), rules, states)).toBe("time");
    expect(
      missingStep(flow({ ...chosen, start: "18:15", durationMinutes: 180 }), rules, states),
    ).toBe("time");
    const timed = { ...chosen, start: "18:00", durationMinutes: 240 };
    expect(missingStep(flow(timed), rules, states)).toBe("details");
    expect(missingStep(flow({ ...timed, name: "Sara", phone: "123" }), rules, states)).toBe(
      "details",
    );
    expect(
      missingStep(flow({ ...timed, name: "Sara", phone: "3900 1122" }), rules, states),
    ).toBeNull();
  });

  it("sends the chosen services with their variants, and the place", () => {
    const request = toBookingRequest(
      "b1",
      flow({
        day: "2026-10-10",
        services: ["p2", "p1"],
        start: "18:00",
        durationMinutes: 240,
        name: " Sara ",
        phone: "39001122",
        area: "الجفير",
        venue: "  Villa 12 ",
      }),
      [booth, prints],
    );
    expect(request).toEqual({
      brandId: "b1",
      day: "2026-10-10",
      start: "18:00",
      durationMinutes: 240,
      items: [
        { product_id: "p1", variant_id: "v-small", quantity: 1 },
        { product_id: "p2", variant_id: "v3", quantity: 1 },
      ],
      customer: { name: "Sara", phone: "39001122" },
      location: { area: "الجفير", venue: "Villa 12" },
      notes: undefined,
    });
  });
});

describe("the WhatsApp message", () => {
  it("carries the request to the store in the customer's language", () => {
    const text = bookingWhatsAppText({
      isAr: true,
      brandName: "أورورا",
      reference: "BK-ABC123",
      dayLabel: "السبت 10 أكتوبر",
      timeLabel: "6:00 م – 10:00 م",
      services: ["فوتوبوث", "طباعة"],
      place: "الجفير",
      name: "سارة",
      totalLabel: null,
    });
    expect(text).toContain("رقم الطلب: BK-ABC123");
    expect(text).toContain("الخدمات: فوتوبوث، طباعة");
    expect(text).not.toContain("الإجمالي");
    const english = bookingWhatsAppText({
      isAr: false,
      brandName: "Aurora",
      reference: "BK-ABC123",
      dayLabel: "Saturday 10 October",
      timeLabel: "6:00 PM – 10:00 PM",
      services: ["Photo booth"],
      place: "",
      name: "Sara",
      totalLabel: "BHD 55.000",
    });
    expect(english.split("\n")).toContain("Total: BHD 55.000");
    expect(english).not.toContain("Place:");
  });

  it("links to the store's WhatsApp, local numbers included", () => {
    expect(whatsAppLink("3999 0016", "Hi")).toBe("https://wa.me/97339990016?text=Hi");
    expect(whatsAppLink(null, "Hi")).toBeNull();
  });
});
