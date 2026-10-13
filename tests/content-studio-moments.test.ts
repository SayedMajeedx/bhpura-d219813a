import { describe, expect, it } from "vitest";
import {
  askedCount,
  backNowProductIds,
  deadlineParts,
  defaultDeadline,
  inStockOptions,
  localDay,
  postablePromos,
  promoOffer,
  ratingSummary,
  type PromoLike,
} from "../src/features/content-studio/lib/moments";
import { clockTurn } from "../src/features/content-studio/templates/last-chance";
import { stampShake } from "../src/features/content-studio/templates/back-in-stock";
import {
  countedRating,
  starFills,
} from "../src/features/content-studio/templates/customer-favourite";
import { BATCH_TEMPLATES } from "../src/features/content-studio/lib/batch";
import { ENGINE_TEMPLATES } from "../src/features/content-studio/templates";
import type { ResolvedVariantAxis } from "../src/lib/variant-axes";

// The templates made for a moment: a sale's last days (Last Chance), a piece
// back on the shelf (Back in Stock) and what customers say (Customer
// Favourite). What each post claims comes from the store's own data.

const now = new Date("2026-10-13T12:00:00Z");
const promo = (over: Partial<PromoLike>): PromoLike => ({
  id: "p",
  code: "EID15",
  discount_type: "percentage",
  discount_value: 15,
  is_active: true,
  start_date: null,
  end_date: "2026-10-16T20:59:59Z",
  max_redemptions: null,
  ...over,
});

describe("Last Chance's code", () => {
  it("offers only codes a public post may name, the soonest to end first", () => {
    const codes = [
      promo({ id: "later", end_date: "2026-10-30T20:00:00Z" }),
      promo({ id: "soon" }),
      // One shopper's code (an abandoned cart's, a review's reward) is never advertised.
      promo({ id: "cart", code: "CART-D73DE62E", max_redemptions: 1 }),
      promo({ id: "off", is_active: false }),
      promo({ id: "over", end_date: "2026-10-01T00:00:00Z" }),
      promo({ id: "open-ended", end_date: null }),
      promo({ id: "not-yet", start_date: "2026-10-20T00:00:00Z" }),
      promo({ id: "limited", max_redemptions: 100 }),
    ];
    expect(postablePromos(codes, now).map((p) => p.id)).toEqual(["soon", "limited", "later"]);
  });

  it("says what a code takes off, an amount apart from the words around it", () => {
    expect(promoOffer(promo({}), "en", "BHD")).toEqual(["15% off"]);
    expect(promoOffer(promo({}), "ar", "د.ب.")).toEqual(["خصم 15٪"]);
    expect(promoOffer(promo({ discount_type: "fixed", discount_value: 5 }), "en", "BHD")).toEqual([
      "5.000 BHD",
      "off",
    ]);
    expect(
      promoOffer(promo({ discount_type: "fixed", discount_value: 12.5 }), "ar", "د.ب."),
    ).toEqual(["خصم", "12.500 د.ب."]);
  });

  it("names the last day on the reader's calendar", () => {
    expect(deadlineParts("2026-10-15", "en")).toEqual({ day: "Thursday", date: "15 October" });
    expect(deadlineParts("2026-10-15", "ar")).toEqual({ day: "الخميس", date: "15 أكتوبر" });
    expect(deadlineParts("15/10/2026", "en")).toBeNull();
    expect(defaultDeadline(new Date(2026, 9, 13, 23, 30))).toBe("2026-10-16");
    expect(localDay(new Date(2026, 0, 5, 1, 0))).toBe("2026-01-05");
  });

  it("ticks the clock's hand once a second", () => {
    expect(clockTurn(0)).toBe(0);
    expect(clockTurn(1.5)).toBeCloseTo(2 / 12);
    expect(clockTurn(3.3)).toBeCloseTo(4 / 12);
  });
});

describe("Back in Stock's shelf", () => {
  const sizeAxis: ResolvedVariantAxis = {
    key: "size",
    field: "size",
    label: "Size",
    values: ["Standard", "S", "M", "L"],
    swatch: false,
  };
  const variants = [
    { id: "v1", product_id: "a", size: "S", stock_main: 0, stock_incubator: 0 },
    { id: "v2", product_id: "a", size: "M", stock_main: 0, stock_incubator: 2 },
    { id: "v3", product_id: "a", size: "L", stock_main: 3, stock_incubator: 0 },
    { id: "v4", product_id: "a", size: "Standard", stock_main: 5, stock_incubator: 0 },
    { id: "v5", product_id: "b", size: "M", stock_main: 0, stock_incubator: 0 },
  ];

  it("names the sizes with a piece, a partner's included, never the placeholder", () => {
    expect(inStockOptions([sizeAxis], variants, "en")).toEqual({
      axisLabel: "Size",
      options: ["M", "L"],
    });
    expect(inStockOptions([sizeAxis], [variants[0]], "en")).toBeNull();
    expect(inStockOptions([], variants, "en")).toBeNull();
  });

  it("finds what is back with shoppers waiting, the most awaited first", () => {
    const requests = [
      { product_id: "a", variant_id: "v1", notified_at: null }, // S is still out
      { product_id: "a", variant_id: "v3", notified_at: null },
      { product_id: "c", variant_id: null, notified_at: null }, // no stock at all
      { product_id: "b", variant_id: null, notified_at: null }, // out
      { product_id: "a", variant_id: null, notified_at: "2026-10-01" }, // already told
    ];
    const withC = [...variants, { id: "c1", product_id: "c", size: "M", stock_main: 1 }];
    expect(backNowProductIds(requests, variants)).toEqual(["a"]);
    expect(backNowProductIds(requests, withC)).toEqual(["a", "c"]);
    expect(askedCount(requests, "a")).toBe(3);
  });

  it("shakes the photo once, after the stamp lands", () => {
    expect(stampShake(0.5)).toBe(0);
    expect(Math.abs(stampShake(1.4))).toBeGreaterThan(0);
    expect(stampShake(3)).toBe(0);
  });
});

describe("Customer Favourite's reviews", () => {
  it("sums the reviews up with nobody's name, and the three things praised most", () => {
    const reviews = [
      { rating: 5, highlights: ["quality", "packaging"] },
      { rating: 5, highlights: ["quality", "delivery"] },
      { rating: 4, highlights: ["quality", "packaging", "unknown"] },
      { rating: 4, highlights: ["service"] },
      { rating: 0, highlights: ["speed"] },
    ];
    expect(ratingSummary(reviews, "en")).toEqual({
      average: 4.5,
      count: 4,
      highlights: ["Product quality", "Packaging", "Delivery"],
    });
    expect(ratingSummary(reviews, "ar")?.highlights[0]).toBe("جودة المنتج");
    expect(ratingSummary([], "en")).toBeNull();
  });

  it("fills the stars in turn to the average, and counts the figure up", () => {
    expect(starFills(4.8, 0)).toEqual([0, 0, 0, 0, 0]);
    const settled = starFills(4.8, 6);
    expect(settled.slice(0, 4)).toEqual([1, 1, 1, 1]);
    expect(settled[4]).toBeCloseTo(0.8);
    expect(countedRating(4.8, 6)).toBe("4.8");
    expect(countedRating(4.8, 0)).toBe("0.0");
  });
});

describe("the moment templates", () => {
  it("are offered, and batch export runs the two that do not depend on one product's stock", () => {
    const ids = ENGINE_TEMPLATES.map((template) => template.id);
    expect(ids).toEqual(
      expect.arrayContaining(["last-chance", "back-in-stock", "customer-favourite"]),
    );
    expect(BATCH_TEMPLATES).toEqual(expect.arrayContaining(["last-chance", "customer-favourite"]));
    expect(BATCH_TEMPLATES).not.toContain("back-in-stock");
  });
});
