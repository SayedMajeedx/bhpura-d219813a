import { describe, expect, it } from "vitest";
import {
  deliveryCountries,
  returnPolicyFor,
  shippingDetailsFor,
} from "../src/lib/seo/offer-policies";
import { buildLocalBusinessSchema, openingHoursSpecification } from "../src/lib/seo/local-business";
import { buildProductSchema } from "../src/lib/seo/structured-data";
import { productHead } from "../src/features/product-page/lib/product-head";
import { storefrontHead } from "../src/features/storefront-shell/lib/storefront-head";

// Richer Google results: how a product is delivered and returned, and a services store as a local
// business. Both say only what the store's own settings say.

const store = { slug: "pura" };
const zones = [
  {
    id: "gcc",
    name_en: "GCC",
    name_ar: "الخليج",
    countries: ["SA", "AE"],
    pricing_type: "flat",
    fee: 3,
  },
  {
    id: "pieces",
    name_en: "Egypt",
    name_ar: "مصر",
    countries: ["EG"],
    pricing_type: "per_piece",
    fee: 4,
    bundle_size: 1,
  },
  {
    id: "all",
    name_en: "World",
    name_ar: "العالم",
    countries: ["*"],
    pricing_type: "flat",
    fee: 9,
  },
] as never;

describe("how a product is delivered, for Google", () => {
  const settings = {
    delivery_enabled: true,
    delivery_fee: 1.5,
    currency: "BHD",
    shipping_zones: zones,
  };

  it("gives the store's own fee for Bahrain and each zone's fee for one piece", () => {
    const details = shippingDetailsFor(settings)!;
    expect(details[0]).toEqual({
      "@type": "OfferShippingDetails",
      shippingRate: { "@type": "MonetaryAmount", value: 1.5, currency: "BHD" },
      shippingDestination: { "@type": "DefinedRegion", addressCountry: "BH" },
    });
    expect(details[1]).toMatchObject({
      shippingRate: { value: 3 },
      shippingDestination: { addressCountry: ["SA", "AE"] },
    });
    expect(details[2]).toMatchObject({
      shippingRate: { value: 4 },
      shippingDestination: { addressCountry: "EG" },
    });
    // a wildcard zone names no country, so it names none to Google
    expect(details).toHaveLength(3);
  });

  it("is free when the store charges nothing, and absent when it does not deliver", () => {
    expect(
      shippingDetailsFor({ ...settings, delivery_fee: 0, shipping_zones: [] })![0],
    ).toMatchObject({
      shippingRate: { value: 0 },
    });
    expect(shippingDetailsFor({ ...settings, delivery_enabled: false })).toBeNull();
    expect(shippingDetailsFor(null)).toBeNull();
    expect(deliveryCountries({ ...settings, delivery_enabled: false })).toEqual([]);
    expect(deliveryCountries(settings)).toEqual(["BH", "SA", "AE", "EG"]);
  });

  it("publishes no delivery time, which the store writes as free text", () => {
    expect(JSON.stringify(shippingDetailsFor(settings))).not.toContain("deliveryTime");
  });
});

describe("how a product is returned, for Google", () => {
  const settings = { delivery_enabled: true, delivery_fee: 1, currency: "BHD", shipping_zones: [] };

  it("is the policy's window in days for the countries the store delivers to", () => {
    expect(
      returnPolicyFor({
        policy: { return_window_days: 14, customer_shipping_fee_borne_by: "store" },
        settings,
        store,
      }),
    ).toEqual({
      "@type": "MerchantReturnPolicy",
      applicableCountry: ["BH"],
      returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
      merchantReturnDays: 14,
      returnFees: "https://schema.org/FreeReturn",
    });
  });

  it("names the return shipping fee a customer pays, and links the store's returns page", () => {
    const policy = returnPolicyFor({
      policy: {
        return_window_days: 7,
        customer_shipping_fee_borne_by: "customer",
        return_shipping_fee: 2,
      },
      settings,
      store,
      pages: [{ slug: "about" }, { slug: "returns-policy", title_en: "Returns" }],
    })!;
    expect(policy.returnFees).toBe("https://schema.org/ReturnShippingFees");
    expect(policy.returnShippingFeesAmount).toEqual({
      "@type": "MonetaryAmount",
      value: 2,
      currency: "BHD",
    });
    expect(policy.merchantReturnLink).toBe("https://pura.boutq.store/pura/returns-policy");
  });

  it("is absent when the store set no window", () => {
    expect(returnPolicyFor({ policy: { return_window_days: 0 }, settings, store })).toBeNull();
    expect(returnPolicyFor({ policy: null, settings, store })).toBeNull();
  });
});

describe("the product page's Google data", () => {
  const loaderData = {
    initialLang: "en",
    brand: { slug: "pura", name_en: "Pura", name_ar: "بيورا" },
    currency: "BHD",
    product: { id: "p1", name_en: "Abaya", base_price: 30, product_variants: [] },
    delivery: { delivery_enabled: true, delivery_fee: 1.5, currency: "BHD", shipping_zones: [] },
    returnPolicy: { return_window_days: 14, customer_shipping_fee_borne_by: "store" },
    pages: [],
  };
  const offersOf = (data: object) => {
    const head = productHead({ loaderData: data, params: { slug: "pura", id: "p1" } }) as never as {
      scripts: Array<{ children: string }>;
    };
    return JSON.parse(head.scripts[0].children).offers;
  };

  it("carries the delivery and the return policy on the offer", () => {
    const offers = offersOf(loaderData);
    expect(offers.shippingDetails[0].shippingRate.value).toBe(1.5);
    expect(offers.hasMerchantReturnPolicy.merchantReturnDays).toBe(14);
  });

  it("carries neither for a service, which is booked and not delivered", () => {
    const offers = offersOf({ ...loaderData, servicesStore: true });
    expect(offers.shippingDetails).toBeUndefined();
    expect(offers.hasMerchantReturnPolicy).toBeUndefined();
  });

  it("is unchanged for a product schema built without them", () => {
    const schema = buildProductSchema({ id: "p1", price: 3 }, { slug: "pura" });
    expect(schema.offers).not.toHaveProperty("shippingDetails");
    expect(schema.offers).not.toHaveProperty("hasMerchantReturnPolicy");
  });
});

describe("a services store as a local business", () => {
  const hours = {
    enabled: true,
    timezone: "Asia/Bahrain",
    after_hours: "accept",
    days: {
      "0": [],
      "1": [{ from: "10:00", to: "22:00" }],
      "2": [{ from: "10:00", to: "22:00" }],
      "5": [
        { from: "09:00", to: "12:00" },
        { from: "16:00", to: "24:00" },
      ],
    },
  };

  it("writes the hours grouped by window, and none when they are off", () => {
    expect(openingHoursSpecification(hours)).toEqual([
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Monday", "Tuesday"],
        opens: "10:00",
        closes: "22:00",
      },
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Friday"],
        opens: "09:00",
        closes: "12:00",
      },
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Friday"],
        opens: "16:00",
        closes: "23:59",
      },
    ]);
    expect(openingHoursSpecification({ ...hours, enabled: false })).toEqual([]);
    expect(openingHoursSpecification(null)).toEqual([]);
  });

  it("says who, how to reach it, where it serves and when, and nothing it was not told", () => {
    const schema = buildLocalBusinessSchema({
      brand: { slug: "aurora", name_en: "Aurora", name_ar: "أورورا" },
      settings: {
        currency: "BHD",
        whatsapp_number: "+97339950016",
        opening_hours: hours,
        socials: [{ name: "instagram", url: "https://instagram.com/aurora" }],
      },
      lang: "ar",
      image: "https://cdn.test/a.jpg",
    });
    expect(schema).toMatchObject({
      "@type": "LocalBusiness",
      name: "أورورا",
      url: "https://aurora.boutq.store/aurora",
      telephone: "+97339950016",
      areaServed: { "@type": "Country", name: "Bahrain" },
      sameAs: ["https://instagram.com/aurora"],
    });
    expect(schema).not.toHaveProperty("address");
    const bare = buildLocalBusinessSchema({
      brand: { slug: "x", name_en: "X" },
      settings: null,
      lang: "en",
    });
    expect(bare).not.toHaveProperty("areaServed");
    expect(bare).not.toHaveProperty("openingHoursSpecification");
    expect(bare).not.toHaveProperty("telephone");
  });

  it("is on a booking store's home page only", () => {
    const data = {
      brand: { slug: "aurora", name_en: "Aurora", name_ar: "أورورا", logo_url: null },
      settings: {
        business_name: "Aurora",
        store_vertical: "services",
        currency: "BHD",
        opening_hours: hours,
      },
      initialLang: "en" as const,
    };
    const types = (head: unknown) =>
      (head as { scripts: Array<{ children?: string }> }).scripts
        .map((script) => script.children && JSON.parse(script.children)["@type"])
        .filter(Boolean);
    expect(types(storefrontHead(data, { home: true }))).toContain("LocalBusiness");
    expect(types(storefrontHead(data))).not.toContain("LocalBusiness");
    const shop = { ...data, settings: { ...data.settings, store_vertical: "fashion" } };
    expect(types(storefrontHead(shop, { home: true }))).not.toContain("LocalBusiness");
  });
});
