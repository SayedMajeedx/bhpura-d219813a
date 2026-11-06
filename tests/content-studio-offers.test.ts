import { describe, expect, it } from "vitest";
import { studioOfferedSale } from "../src/features/content-studio/lib/sale-price";
import { entryBody, lookbookEntries } from "../src/features/content-studio/lib/lookbook";
import type { Product } from "../src/features/content-studio/lib/studio-content";
import type { StoreOffer } from "../src/lib/offers";

// The store's automatic offers in the content studio: the price a post shows is the price a shopper
// pays (the storefront's own rule), with the day the offer ends.

const offer = (over: Partial<StoreOffer> = {}): StoreOffer => ({
  id: "o1",
  kind: "discount",
  name_ar: "عرض الاطلاق",
  name_en: "Launch offer",
  ends_at: "2026-11-14T12:40:00Z",
  min_subtotal: null,
  min_items: null,
  product_ids: [],
  category_slugs: [],
  exclude_sale_items: false,
  discount_type: "percentage",
  discount_value: 20,
  max_discount: null,
  buy_quantity: null,
  get_quantity: null,
  get_product_ids: [],
  get_category_slugs: [],
  get_percent: null,
  max_sets: null,
  local_only: false,
  ...over,
});

const product = (id: string, extra: Partial<Product> = {}): Product => ({
  id,
  name: `Product ${id}`,
  name_ar: `منتج ${id}`,
  name_en: null,
  description: null,
  description_ar: null,
  image_url: null,
  media: null,
  base_price: 30,
  ...extra,
});
const variant = (id: string, price: number, original: number | null = null) => ({
  id,
  product_id: "a",
  selling_price: price,
  original_price: original,
  stock_main: 5,
});

describe("studioOfferedSale", () => {
  const a = product("a");

  it("takes the offer off the price and carries the day it ends", () => {
    const {
      sale,
      endsAt,
      offer: reaching,
    } = studioOfferedSale(a, [variant("v1", 30)], null, [offer()]);
    expect(sale).toEqual({ original: 30, price: 24, percent: 20 });
    expect(endsAt).toBe("2026-11-14T12:40:00Z");
    expect(reaching?.id).toBe("o1");
  });

  it("has no end day when the offer has none", () => {
    const { sale, endsAt } = studioOfferedSale(a, [variant("v1", 30)], null, [
      offer({ ends_at: null }),
    ]);
    expect(sale?.price).toBe(24);
    expect(endsAt).toBeNull();
  });

  it("prices the chosen variant, or the cheapest one when none is chosen", () => {
    const variants = [variant("v1", 30), variant("v2", 20)];
    expect(studioOfferedSale(a, variants, null, [offer()]).sale?.price).toBe(16);
    expect(studioOfferedSale(a, variants, variants[0], [offer()]).sale?.price).toBe(24);
  });

  it("keeps the product's own sale when no offer reaches it", () => {
    const variants = [variant("v1", 24, 30)];
    const reaches = offer({ product_ids: ["other"] });
    const { sale, endsAt } = studioOfferedSale(a, variants, null, [reaches]);
    expect(sale).toEqual({ original: 30, price: 24, percent: 20 });
    expect(endsAt).toBeNull();
    expect(studioOfferedSale(a, variants, null, []).sale).toEqual(sale);
  });

  it("follows the offer's own reach: a named category, and pieces already on sale", () => {
    const filed = product("a", { category: "abayas" });
    expect(
      studioOfferedSale(filed, [variant("v1", 30)], null, [offer({ category_slugs: ["abayas"] })])
        .sale?.price,
    ).toBe(24);
    expect(
      studioOfferedSale(a, [variant("v1", 30)], null, [offer({ category_slugs: ["abayas"] })]).sale,
    ).toBeNull();
    expect(
      studioOfferedSale(a, [variant("v1", 24, 30)], null, [offer({ exclude_sale_items: true })])
        .endsAt,
    ).toBeNull();
  });

  it("ignores an offer that is not a plain percentage off", () => {
    const fixed = offer({ discount_type: "fixed", discount_value: 5 });
    const minimum = offer({ min_subtotal: 100 });
    expect(studioOfferedSale(a, [variant("v1", 30)], null, [fixed, minimum]).sale).toBeNull();
  });
});

describe("the lookbook's entries with offers", () => {
  const a = product("a", {
    description_ar: "قماش كريب خفيف\nوأكمام واسعة",
    description: "Light crepe.",
  });
  const b = product("b", { description_ar: null, description: null });
  const variants = [
    { product_id: "a", selling_price: 30, original_price: null },
    { product_id: "b", selling_price: 20, original_price: null },
  ];

  it("prices each piece after the offer and keeps the price before it", () => {
    const [first, second] = lookbookEntries([a, b], variants, "en", [offer()]);
    expect([first.price, first.originalPrice]).toEqual([24, 30]);
    expect([second.price, second.originalPrice]).toEqual([16, 20]);
    expect(lookbookEntries([a], variants, "en")[0].originalPrice).toBeNull();
  });

  it("gives each piece its own description in the post's language", () => {
    const [first, second] = lookbookEntries([a, b], variants, "ar");
    expect(first.body).toBe("قماش كريب خفيف");
    expect(second.body).toBe("");
    expect(entryBody(a, "en")).toBe("Light crepe.");
  });
});
