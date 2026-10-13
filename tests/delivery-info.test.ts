import { describe, expect, it } from "vitest";
import {
  deliveryInfo,
  policyPagesOf,
  returnWindowText,
  type DeliveryInfoSettings,
} from "../src/lib/delivery-info";
import { deliveryEstimateLines, zoneEstimate } from "../src/lib/delivery-estimate";

// Everything a shopper is told about delivery and returns comes from the store's own settings,
// in one place. The product page once showed every store the same fixed paragraph ("2-4 business
// days across all GCC countries, returns within 14 days") and never what the store had written.

const money = (amount: number) => `${amount.toFixed(3)} BHD`;
const store: DeliveryInfoSettings = {
  delivery_enabled: true,
  pickup_enabled: true,
  delivery_estimate_enabled: true,
  delivery_fee: 2,
  currency: "BHD",
  delivery_estimate_en: "Within 24 hours to Bahrain",
  delivery_estimate_ar: "خلال 24 ساعة داخل البحرين",
  shipping_zones: [],
  shipping_returns_en: null,
  shipping_returns_ar: null,
};
const info = (
  settings: DeliveryInfoSettings | null,
  extra: Partial<Parameters<typeof deliveryInfo>[0]> = {},
) => deliveryInfo({ settings, lang: "en", formatMoney: money, ...extra });
const facts = (
  settings: DeliveryInfoSettings | null,
  extra: Partial<Parameters<typeof deliveryInfo>[0]> = {},
) => info(settings, extra).facts.map((fact) => [fact.id, fact.label, fact.text]);

describe("what a shopper is told about delivery", () => {
  it("is the store's own time, its fee and whether an order can be collected", () => {
    expect(facts(store)).toEqual([
      ["delivery_time", "Delivery time", "Within 24 hours to Bahrain"],
      ["delivery_fee", "Delivery within Bahrain", "2.000 BHD"],
      ["pickup", "Pickup from the store", "Available, no charge"],
    ]);
  });

  it("is in the reader's language", () => {
    const arabic = deliveryInfo({ settings: store, lang: "ar", formatMoney: money });
    expect(arabic.facts.map((fact) => [fact.label, fact.text])).toEqual([
      ["مدة التوصيل", "خلال 24 ساعة داخل البحرين"],
      ["التوصيل داخل البحرين", "2.000 BHD"],
      ["الاستلام من المتجر", "متاح، بدون رسوم"],
    ]);
  });

  it("says free when the store charges nothing, as checkout does", () => {
    expect(facts({ ...store, delivery_fee: 0, pickup_enabled: false })[1]).toEqual([
      "delivery_fee",
      "Delivery within Bahrain",
      "Free",
    ]);
  });

  it("gives a made-to-order product both times, each named", () => {
    const tailored = { ...store, delivery_estimate_tailored_en: "One week from confirmation" };
    expect(facts(tailored, { kinds: { ready: true, tailored: true } }).slice(0, 2)).toEqual([
      ["ready_time", "Ready pieces", "Within 24 hours to Bahrain"],
      ["making_time", "Made-to-order pieces", "One week from confirmation"],
    ]);
    // A piece that is only made to order has no ready time to speak of.
    expect(facts(tailored, { kinds: { ready: false, tailored: true } })[0]).toEqual([
      "making_time",
      "Delivery time",
      "One week from confirmation",
    ]);
  });

  it("lists each place the store ships to with that zone's own fee and time", () => {
    const abroad = {
      ...store,
      shipping_zones: [
        {
          id: "gcc",
          name_en: "GCC",
          name_ar: "الخليج",
          countries: ["SA", "AE"],
          pricing_type: "flat" as const,
          fee: 5,
          estimate_en: "3 - 5 business days",
          estimate_ar: "",
        },
        {
          id: "z2",
          name_en: "",
          name_ar: "",
          countries: ["EG"],
          pricing_type: "flat" as const,
          fee: 9,
        },
      ],
    };
    const zones = facts(abroad).filter(([id]) => id === "abroad");
    expect(zones[0]).toEqual([
      "abroad",
      "GCC",
      "Flat rate per order: 5.000 BHD · 3 - 5 business days",
    ]);
    // A zone with no name is named by its countries, and one with no time says none.
    expect(zones[1][2]).toBe("Flat rate per order: 9.000 BHD");
    expect(zones[1][1]).not.toBe("");
    const keys = info(abroad).facts.map((fact) => fact.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("what is never said", () => {
  it("is a time the store did not write", () => {
    const silent = { ...store, delivery_estimate_en: null, delivery_estimate_ar: null };
    expect(facts(silent).map(([id]) => id)).toEqual(["delivery_fee", "pickup"]);
    expect(
      deliveryEstimateLines({
        kinds: { ready: true, tailored: false },
        settings: silent,
        lang: "en",
        readyText: null,
      }),
    ).toEqual([]);
    expect(zoneEstimate({ estimate_en: "  ", estimate_ar: "" }, "en")).toBeNull();
    expect(zoneEstimate(null, "ar")).toBeNull();
  });

  it("is a time, when the store switched its estimate off", () => {
    expect(facts({ ...store, delivery_estimate_enabled: false }).map(([id]) => id)).toEqual([
      "delivery_fee",
      "pickup",
    ]);
  });

  it("is delivery at all, for a store that does not deliver", () => {
    expect(facts({ ...store, delivery_enabled: false }).map(([id]) => id)).toEqual(["pickup"]);
  });

  it("is a return window the store has not set", () => {
    expect(facts(store).some(([id]) => id === "returns")).toBe(false);
    const zeroDays = facts(store, { returnPolicy: { return_window_days: 0 } });
    expect(zeroDays.some(([id]) => id === "returns")).toBe(false);
  });

  it("is anything, for a store with nothing to say: the section is left out", () => {
    const nothing = info({ delivery_enabled: false, pickup_enabled: false });
    expect(nothing.hasAnything).toBe(false);
    expect(nothing.facts).toEqual([]);
    expect(JSON.stringify(info(store))).not.toMatch(/GCC|14 days|business days/);
  });
});

describe("returns and the store's own words", () => {
  it("states the return window from the store's return policy, with its terms", () => {
    const withPolicy = info(store, {
      returnPolicy: {
        return_window_days: 7,
        policy_terms_en: "Unworn, with tags.",
        policy_terms_ar: null,
      },
    });
    expect(withPolicy.facts.at(-1)).toMatchObject({
      id: "returns",
      label: "Returns",
      text: "Within 7 days of receiving your order",
    });
    expect(withPolicy.returnTerms).toBe("Unworn, with tags.");
  });

  it("writes the window in Arabic as Arabic counts days", () => {
    expect(returnWindowText(1, "ar")).toBe("خلال يوم واحد من استلام الطلب");
    expect(returnWindowText(2, "ar")).toBe("خلال يومين من استلام الطلب");
    expect(returnWindowText(7, "ar")).toBe("خلال 7 أيام من استلام الطلب");
    expect(returnWindowText(14, "ar")).toBe("خلال 14 يوماً من استلام الطلب");
    expect(returnWindowText(1, "en")).toBe("Within 1 day of receiving your order");
  });

  it("shows what the store wrote about shipping and returns, in the reader's language", () => {
    const written = {
      ...store,
      shipping_returns_en: "  Exchanges within 3 days.  ",
      shipping_returns_ar: "الاستبدال خلال 3 أيام.",
    };
    expect(info(written).note).toBe("Exchanges within 3 days.");
    const arabic = deliveryInfo({ settings: written, lang: "ar", formatMoney: money });
    expect(arabic.note).toBe("الاستبدال خلال 3 أيام.");
    expect(info(store).note).toBeNull();
  });

  it("points to the store's own pages about delivery and returns, and to no other page", () => {
    const pages = [
      { slug: "about-us", title_en: "About us", title_ar: "من نحن" },
      { slug: "shipping-delivery", title_en: "Shipping & Delivery", title_ar: "الشحن والتوصيل" },
      { slug: "page-3", title_en: null, title_ar: "سياسة الاسترجاع" },
      { slug: "returns-refunds", title_en: null, title_ar: null },
    ];
    expect(policyPagesOf(pages, "en")).toEqual([
      { idx: 2, title: "Shipping & Delivery" },
      { idx: 3, title: "سياسة الاسترجاع" },
    ]);
    expect(policyPagesOf(pages, "ar")[0]).toEqual({ idx: 2, title: "الشحن والتوصيل" });
    expect(info(store, { pages }).pages).toHaveLength(2);
    expect(policyPagesOf(null, "en")).toEqual([]);
  });
});
