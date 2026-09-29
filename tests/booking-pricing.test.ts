import { describe, expect, it } from "vitest";
import { DEFAULT_BOOKING_RULES, durations, travelFeeFor } from "../src/lib/bookings/rules";
import {
  chosenTotal,
  compareAtFor,
  EMPTY_FLOW,
  missingStep,
  offeredDurations,
  priceFor,
  serviceDurations,
  toBookingRequest,
  variantFor,
  type BookableService,
  type FlowState,
} from "../src/features/storefront-booking/lib/booking-flow";
import {
  durationPriceRows,
  durationVariants,
} from "../src/features/inventory/lib/duration-pricing";
import {
  travelFeeDraft,
  travelFeesToSave,
} from "../src/features/bookings/components/TravelFeesFields";

// A photo booth priced by duration (3 to 5 hours), prints at a flat price,
// and a package on offer below the sum of its parts.
const booth: BookableService = {
  id: "booth",
  name: "Photo booth",
  name_ar: "فوتوبوث",
  name_en: "Photo booth",
  image_url: null,
  product_variants: [
    { id: "b3", selling_price: 55, duration_minutes: 180 },
    { id: "b4", selling_price: 70, duration_minutes: 240 },
    { id: "b5", selling_price: 85, duration_minutes: 300 },
  ],
};
const prints: BookableService = {
  ...booth,
  id: "prints",
  name: "Prints",
  product_variants: [{ id: "p1", selling_price: 35 }],
};
const gold: BookableService = {
  ...booth,
  id: "gold",
  name: "Gold package",
  product_variants: [{ id: "g1", selling_price: 165, original_price: 205 }],
};

describe("services priced by duration", () => {
  it("offers only the lengths every chosen service has", () => {
    const store = durations(DEFAULT_BOOKING_RULES); // 3 to 8 hours
    expect(serviceDurations(booth)).toEqual([180, 240, 300]);
    expect(serviceDurations(prints)).toEqual([]);
    expect(offeredDurations(store, [prints])).toEqual(store);
    expect(offeredDurations(store, [booth, prints])).toEqual([180, 240, 300]);
  });

  it("prices each service for the chosen length, flat services as they are", () => {
    expect(priceFor(booth, null)).toBe(55); // "from"
    expect(priceFor(booth, 240)).toBe(70);
    expect(variantFor(booth, 240)?.id).toBe("b4");
    expect(variantFor(booth, 360)).toBeNull();
    expect(priceFor(prints, 240)).toBe(35);
    expect(chosenTotal(["booth", "prints"], [booth, prints], 300)).toBe(120);
  });

  it("shows a package's compare-at price", () => {
    expect(compareAtFor(gold, null)).toBe(205);
    expect(compareAtFor(prints, null)).toBeNull();
  });

  it("asks for another length when a chosen service does not offer it", () => {
    const states = new Map([["2026-10-10", "available" as const]]);
    const flow: FlowState = {
      ...EMPTY_FLOW,
      day: "2026-10-10",
      services: ["booth"],
      start: "18:00",
      durationMinutes: 360,
      name: "Sara",
      phone: "39001122",
    };
    expect(missingStep(flow, DEFAULT_BOOKING_RULES, states, [booth])).toBe("time");
    expect(
      missingStep({ ...flow, durationMinutes: 240 }, DEFAULT_BOOKING_RULES, states, [booth]),
    ).toBeNull();
  });

  it("books the length's variant and sends the area's code", () => {
    const request = toBookingRequest(
      "b1",
      {
        ...EMPTY_FLOW,
        day: "2026-10-10",
        services: ["booth", "prints"],
        start: "18:00",
        durationMinutes: 240,
        area: "Juffair",
        areaCode: "juffair",
      },
      [booth, prints],
    );
    expect(request.items).toEqual([
      { product_id: "booth", variant_id: "b4", quantity: 1 },
      { product_id: "prints", variant_id: "p1", quantity: 1 },
    ]);
    expect(request.location).toEqual({ area: "Juffair", area_code: "juffair" });
  });
});

describe("the price-by-duration helper", () => {
  it("prices the shortest length at the base and each extra hour on top", () => {
    const rows = durationPriceRows({
      lengths: [180, 240, 300],
      basePrice: 55,
      extraHourPrice: 15,
      existingMinutes: [240],
    });
    expect(rows).toEqual([
      { minutes: 180, price: 55, exists: false },
      { minutes: 240, price: 70, exists: true },
      { minutes: 300, price: 85, exists: false },
    ]);
    // Existing lengths are left alone; the rest are labelled in the store's language.
    expect(durationVariants("booth", rows, false)).toEqual([
      { product_id: "booth", size: "3 hours", selling_price: 55, duration_minutes: 180 },
      { product_id: "booth", size: "5 hours", selling_price: 85, duration_minutes: 300 },
    ]);
    expect(durationVariants("booth", rows, true)[0].size).toBe("3 ساعات");
  });

  it("works in half hours and rounds to the fils", () => {
    const rows = durationPriceRows({
      lengths: [180, 210],
      basePrice: 10,
      extraHourPrice: 7.333,
      existingMinutes: [],
    });
    expect(rows[1].price).toBe(13.667);
    expect(
      durationPriceRows({ lengths: [], basePrice: 1, extraHourPrice: 1, existingMinutes: [] }),
    ).toEqual([]);
  });
});

describe("travel fees by area", () => {
  const rules = { travel_fees: { juffair: 5, hidd: 12 }, travel_fee_default: 8 };

  it("charges the area's fee, else the store's default, else nothing", () => {
    expect(travelFeeFor(rules, "juffair")).toBe(5);
    expect(travelFeeFor(rules, "sitra")).toBe(8);
    expect(travelFeeFor(rules, "")).toBe(8);
    expect(travelFeeFor({ travel_fees: {}, travel_fee_default: null }, "sitra")).toBeNull();
  });

  it("saves typed fees, clears emptied areas and refuses a bad amount", () => {
    const saved = { juffair: 5, hidd: 12 };
    const draft = travelFeeDraft(8, saved);
    expect(draft).toEqual({ defaultFee: "8", byArea: { juffair: "5", hidd: "12" } });
    expect(
      travelFeesToSave({ defaultFee: "", byArea: { juffair: "6", hidd: "", sitra: "9" } }, saved),
    ).toEqual({ defaultFee: null, byArea: { juffair: 6, hidd: null, sitra: 9 } });
    expect(travelFeesToSave({ defaultFee: "-1", byArea: {} }, saved)).toBeNull();
    expect(travelFeesToSave({ defaultFee: "", byArea: { sitra: "abc" } }, saved)).toBeNull();
  });
});
