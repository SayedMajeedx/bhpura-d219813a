import { describe, it, expect, beforeEach } from "vitest";
import { resolveColorHex, extractUniqueVariantColors } from "../src/lib/color-names";
import { canQuickAddToCart, buildCartItem } from "../src/lib/cart/add-to-cart";
import {
  recordRecentlyViewed,
  getRecentlyViewedIds,
} from "../src/components/storefront/RecentlyViewed";

describe("Storefront V2 Layer 2 - Color Resolution & Swatches", () => {
  it("resolves Arabic and English color names to correct hex codes", () => {
    expect(resolveColorHex("أسود")).toBe("#0b0c10");
    expect(resolveColorHex("black")).toBe("#0b0c10");
    expect(resolveColorHex("أبيض")).toBe("#ffffff");
    expect(resolveColorHex("white")).toBe("#ffffff");
    expect(resolveColorHex("بيج")).toBe("#f5f5dc");
    expect(resolveColorHex("كحلي")).toBe("#1e3a8a");
    expect(resolveColorHex("navy")).toBe("#1e3a8a");
    expect(resolveColorHex("عنابي")).toBe("#800020");
    expect(resolveColorHex("burgundy")).toBe("#800020");
    expect(resolveColorHex("unknown-fancy-shade")).toBeNull();
  });

  it("extracts unique variant colors accurately", () => {
    const variants = [
      { id: "v1", color: "أسود", stock_main: 5, stock_incubator: 0 },
      { id: "v2", color: "أسود", stock_main: 0, stock_incubator: 0 },
      { id: "v3", color: "بيج", stock_main: 0, stock_incubator: 0 },
      { id: "v4", color: "كحلي", stock_main: 2, stock_incubator: 1 },
    ];

    const extracted = extractUniqueVariantColors(variants);
    expect(extracted).toHaveLength(3);

    const black = extracted.find((c) => c.name === "أسود");
    expect(black).toBeDefined();
    expect(black?.hex).toBe("#0b0c10");

    const beige = extracted.find((c) => c.name === "بيج");
    expect(beige).toBeDefined();
    expect(beige?.hex).toBe("#f5f5dc");

    const navy = extracted.find((c) => c.name === "كحلي");
    expect(navy).toBeDefined();
    expect(navy?.hex).toBe("#1e3a8a");
  });
});

describe("Storefront V2 Layer 2 - Safe Quick Add to Cart", () => {
  it("canQuickAddToCart returns true for simple in-stock products without custom fields", () => {
    const simpleProduct = {
      id: "p1",
      name: "Classic Linen Abaya",
      custom_fields: null,
      product_variants: [
        {
          id: "v1",
          stock_main: 3,
          selling_price: 45,
        },
      ],
    };

    expect(canQuickAddToCart(simpleProduct)).toBe(true);
  });

  it("canQuickAddToCart returns false for products requiring custom tailoring fields", () => {
    const bespokeProduct = {
      id: "p2",
      name: "Bespoke Evening Gown",
      custom_fields: [{ key: "length", label_ar: "الطول", required: true }],
      product_variants: [
        {
          id: "v1",
          stock_main: 3,
          selling_price: 80,
        },
      ],
    };

    expect(canQuickAddToCart(bespokeProduct)).toBe(false);
  });

  it("canQuickAddToCart returns false when product has multiple variants", () => {
    const multiVariantProduct = {
      id: "p3",
      name: "Casual Dress",
      custom_fields: null,
      product_variants: [
        { id: "v1", size: "S", stock_main: 2, selling_price: 30 },
        { id: "v2", size: "M", stock_main: 4, selling_price: 30 },
      ],
    };

    expect(canQuickAddToCart(multiVariantProduct)).toBe(false);
  });

  it("buildCartItem constructs complete cart payload with variant details", () => {
    const product = {
      id: "prod-99",
      name: "Silk Kaftan",
      name_ar: "قفطان حرير",
      name_en: "Silk Kaftan",
      image_url: "https://boutq.app/kaftan.jpg",
    };
    const variant = {
      id: "var-1",
      selling_price: 55,
      size: "54",
      size_unit: "inch",
      color: "أزرق سماوي",
    };

    const cartItem = buildCartItem(product, variant, 2);
    expect(cartItem.product_id).toBe("prod-99");
    expect(cartItem.variant_id).toBe("var-1");
    expect(cartItem.price).toBe(55);
    expect(cartItem.qty).toBe(2);
    expect(cartItem.size).toBe("54");
    expect(cartItem.color).toBe("أزرق سماوي");
  });
});

describe("Storefront V2 Layer 2 - Recently Viewed Storage", () => {
  const brandSlug = "test-boutique";

  beforeEach(() => {
    localStorage.clear();
  });

  it("records recently viewed products without duplicates and maintains recency", () => {
    recordRecentlyViewed(brandSlug, "prod-1");
    recordRecentlyViewed(brandSlug, "prod-2");
    recordRecentlyViewed(brandSlug, "prod-3");

    let ids = getRecentlyViewedIds(brandSlug);
    expect(ids).toEqual(["prod-3", "prod-2", "prod-1"]);

    // Re-view prod-1: should move to front
    recordRecentlyViewed(brandSlug, "prod-1");
    ids = getRecentlyViewedIds(brandSlug);
    expect(ids).toEqual(["prod-1", "prod-3", "prod-2"]);
  });

  it("caps recently viewed products at 12 items", () => {
    for (let i = 1; i <= 20; i++) {
      recordRecentlyViewed(brandSlug, `prod-${i}`);
    }

    const ids = getRecentlyViewedIds(brandSlug);
    expect(ids).toHaveLength(12);
    expect(ids[0]).toBe("prod-20");
    expect(ids[11]).toBe("prod-9");
  });
});
