import { describe, expect, it } from "vitest";
import {
  cartEstimateKinds,
  deliveryEstimateLines,
  estimateLineText,
  readyEstimate,
  tailoredEstimate,
} from "../src/lib/delivery-estimate";
import previous from "../supabase/migrations/20261005140000_storefront_banner_size.sql?raw";
import migration from "../supabase/migrations/20261007100000_tailored_delivery_estimate.sql?raw";

// A ready piece and a made-to-order piece do not take the same time to arrive: the store writes one
// estimate for each, and the shopper is told the one that fits what they are buying.

const settings = {
  delivery_estimate_ar: "خلال 24 ساعة",
  delivery_estimate_en: "Within 24 hours",
  delivery_estimate_tailored_ar: "خلال 7 - 10 أيام",
  delivery_estimate_tailored_en: "Within 7 - 10 days",
};
const lines = (kinds: { ready: boolean; tailored: boolean }, over = {}, afterMaking?: string) =>
  deliveryEstimateLines({
    kinds,
    settings: { ...settings, ...over },
    lang: "en",
    readyText: "Within 24 hours",
    afterMaking,
  });

describe("which kinds of piece a cart holds", () => {
  const made = new Set(["abaya"]);
  const kinds = (...items: Array<Record<string, unknown>>) =>
    cartEstimateKinds(items as never, made);

  it("reads a ready product as ready and a made-to-order one as tailored", () => {
    expect(kinds({ product_id: "scarf" })).toEqual({ ready: true, tailored: false });
    expect(kinds({ product_id: "abaya" })).toEqual({ ready: false, tailored: true });
  });

  it("reads a ready size chosen on a made-to-order product as ready", () => {
    expect(kinds({ product_id: "abaya", tailored: false })).toEqual({
      ready: true,
      tailored: false,
    });
    expect(kinds({ product_id: "abaya", tailored: true })).toEqual({
      ready: false,
      tailored: true,
    });
  });

  it("sees both kinds in a mixed cart, and ignores a booked service", () => {
    expect(kinds({ product_id: "scarf" }, { product_id: "abaya" })).toEqual({
      ready: true,
      tailored: true,
    });
    expect(kinds({ product_id: "abaya", booking: { id: "b" } })).toEqual({
      ready: false,
      tailored: false,
    });
  });
});

describe("what the shopper is told", () => {
  it("is the ready estimate for a ready cart", () => {
    expect(lines({ ready: true, tailored: false })).toEqual([
      { kind: "all", label: null, text: "Within 24 hours" },
    ]);
  });

  it("is the made-to-order estimate for a cart of tailored pieces", () => {
    expect(lines({ ready: false, tailored: true })).toEqual([
      { kind: "tailored", label: null, text: "Within 7 - 10 days" },
    ]);
  });

  it("gives both sentences, each naming its pieces, when the cart holds both", () => {
    const both = lines({ ready: true, tailored: true });
    expect(both.map(estimateLineText)).toEqual([
      "Ready pieces: Within 24 hours",
      "Made-to-order pieces: Within 7 - 10 days",
    ]);
  });

  it("says one thing, as before, when the store wrote no made-to-order estimate", () => {
    for (const kinds of [
      { ready: true, tailored: true },
      { ready: false, tailored: true },
    ]) {
      expect(
        lines(kinds, { delivery_estimate_tailored_en: null, delivery_estimate_tailored_ar: " " }),
      ).toEqual([{ kind: "all", label: null, text: "Within 24 hours" }]);
    }
  });

  it("adds the shipping time to a made-to-order piece sent outside the country", () => {
    expect(lines({ ready: false, tailored: true }, {}, "3 - 5 business days")[0].text).toBe(
      "Within 7 - 10 days, then shipping: 3 - 5 business days",
    );
    expect(
      deliveryEstimateLines({
        kinds: { ready: false, tailored: true },
        settings,
        lang: "ar",
        readyText: "x",
        afterMaking: "خلال 3 - 5 أيام عمل",
      })[0].text,
    ).toBe("خلال 7 - 10 أيام، ثم الشحن: خلال 3 - 5 أيام عمل");
  });

  it("speaks Arabic when the shopper reads Arabic", () => {
    const ar = deliveryEstimateLines({
      kinds: { ready: true, tailored: true },
      settings,
      lang: "ar",
      readyText: settings.delivery_estimate_ar,
    });
    expect(ar.map(estimateLineText)).toEqual([
      "القطع الجاهزة: خلال 24 ساعة",
      "القطع حسب الطلب: خلال 7 - 10 أيام",
    ]);
  });

  it("reads each language's own text from the store's settings", () => {
    expect(readyEstimate(settings, "ar")).toBe("خلال 24 ساعة");
    expect(tailoredEstimate(settings, "en")).toBe("Within 7 - 10 days");
    expect(tailoredEstimate({}, "en")).toBeNull();
  });
});

describe("the migration", () => {
  const view = (sql: string) =>
    sql.slice(sql.indexOf("CREATE OR REPLACE VIEW public.brand_public_settings"));
  const columns = (sql: string) =>
    [
      ...view(sql)
        .split("FROM business_settings")[0]
        .matchAll(/\bbs\.(\w+)/g),
    ].map((m) => m[1]);
  const body = (sql: string) =>
    sql
      .slice(sql.indexOf("CREATE OR REPLACE VIEW public.brand_public_settings"))
      .replace(/\s+/g, " ")
      .trim();

  it("adds the two columns to the end of the public view and changes nothing else in it", () => {
    expect(columns(migration)).toEqual([
      ...columns(previous),
      "delivery_estimate_tailored_ar",
      "delivery_estimate_tailored_en",
    ]);
    const without = body(migration).replace(
      "bs.storefront_banner_size, bs.delivery_estimate_tailored_ar, bs.delivery_estimate_tailored_en",
      "bs.storefront_banner_size",
    );
    expect(without).toBe(body(previous));
  });

  it("adds nullable columns, so a store that writes nothing behaves as before", () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS delivery_estimate_tailored_ar text,/);
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS delivery_estimate_tailored_en text;/);
    expect(migration).not.toMatch(/NOT NULL/);
  });
});
