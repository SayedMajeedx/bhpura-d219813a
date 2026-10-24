import { describe, expect, it } from "vitest";
import { STORE_VERTICALS, type StoreVertical } from "../src/lib/store-profile";
import {
  BRAND_TEMPLATES,
  PRODUCT_PHOTO_CLASS,
  PRODUCT_PHOTO_RATIOS,
  getBrandTemplate,
  HOME_LAYOUTS,
  productCardRatio,
  storefrontHomeLayout,
  verticalHomeLayout,
  verticalProductPhoto,
} from "../src/lib/brand-templates";
import { FONT_MOOD_PRESETS } from "../src/components/settings/QuickThemeCustomizer";

describe("Brand Vertical Templates Registry", () => {
  it("provides a template for every store vertical", () => {
    expect(Object.keys(BRAND_TEMPLATES).sort()).toEqual([...STORE_VERTICALS].sort());
    for (const vertical of STORE_VERTICALS) {
      const template = BRAND_TEMPLATES[vertical];
      expect(template, `Template for ${vertical} must exist`).toBeDefined();
      expect(template.vertical).toBe(vertical);
    }
  });

  it("assigns a valid fontPresetId from FONT_MOOD_PRESETS to every template", () => {
    const validPresetIds = new Set(FONT_MOOD_PRESETS.map((p) => p.id));
    for (const vertical of STORE_VERTICALS) {
      const template = BRAND_TEMPLATES[vertical];
      expect(
        validPresetIds.has(template.fontPresetId),
        `Template ${vertical} has invalid fontPresetId: ${template.fontPresetId}`,
      ).toBe(true);
      expect(template.fontAr).toBeTruthy();
      expect(template.fontEn).toBeTruthy();
    }
  });

  it("provides valid categories matching default vertical categories", () => {
    for (const vertical of STORE_VERTICALS) {
      const template = BRAND_TEMPLATES[vertical];
      expect(template.categories.length).toBeGreaterThan(0);
      for (const cat of template.categories) {
        expect(cat.name_ar).toBeTruthy();
        expect(cat.name_en).toBeTruthy();
        expect(cat.slug).toBeTruthy();
      }
    }
  });

  it("provides valid default palette and fulfillment options", () => {
    for (const vertical of STORE_VERTICALS) {
      const template = BRAND_TEMPLATES[vertical];
      expect(template.defaultPalette.primary).toMatch(/^#[0-9a-f]{6}$/i);
      expect(template.defaultPalette.secondary).toMatch(/^#[0-9a-f]{6}$/i);
      expect(template.defaultPalette.background).toMatch(/^#[0-9a-f]{6}$/i);
      expect(template.defaultPalette.text).toMatch(/^#[0-9a-f]{6}$/i);

      expect(typeof template.fulfillment.delivery).toBe("boolean");
      expect(typeof template.fulfillment.pickup).toBe("boolean");
      expect(typeof template.fulfillment.digital).toBe("boolean");
      expect(typeof template.fulfillment.deliveryFee).toBe("number");
      expect(template.trustBadges.length).toBeGreaterThan(0);
    }
  });

  it("falls back to general template for unknown vertical in getBrandTemplate", () => {
    const fallback = getBrandTemplate("unknown-vertical" as StoreVertical);
    expect(fallback).toBeDefined();
    expect(fallback.vertical).toBe("general");

    const abayas = getBrandTemplate("abayas");
    expect(abayas.vertical).toBe("abayas");
  });

  it("gives every vertical only what the platform applies: a radius, a photo shape and a home", () => {
    for (const vertical of STORE_VERTICALS) {
      const design = BRAND_TEMPLATES[vertical].design;
      expect(design, `Template for ${vertical} must have design config`).toBeDefined();
      // Nothing else: a preset name, a grid, a spacing or a card style nothing read is gone.
      expect(Object.keys(design!).sort()).toEqual(["homeLayout", "productPhoto", "radius"]);
      expect(HOME_LAYOUTS).toContain(design!.homeLayout);
      expect(design!.radius).toMatch(/^\d+(\.\d+)?rem$/);
      expect(PRODUCT_PHOTO_RATIOS).toContain(design!.productPhoto);
    }
  });

  it("starts clothes portrait, food, beauty and jewellery square, home and services wide", () => {
    expect(verticalProductPhoto("fashion")).toBe("3:4");
    expect(verticalProductPhoto("abayas")).toBe("3:4");
    for (const square of ["food", "coffee", "beauty", "fragrance", "jewelry", "gifts"]) {
      expect(verticalProductPhoto(square)).toBe("1:1");
    }
    expect(verticalProductPhoto("home")).toBe("4:3");
    expect(verticalProductPhoto("services")).toBe("4:3");
    // An unknown or missing vertical takes the general store's.
    expect(verticalProductPhoto("nonsense")).toBe(verticalProductPhoto("general"));
    expect(verticalProductPhoto(null)).toBe("1:1");
  });

  it("shows a store's own photo shape, else its vertical's", () => {
    expect(productCardRatio({ store_vertical: "food" })).toBe("1:1");
    expect(productCardRatio({ store_vertical: "food", product_card_aspect_ratio: null })).toBe(
      "1:1",
    );
    expect(productCardRatio({ store_vertical: "food", product_card_aspect_ratio: "4:5" })).toBe(
      "4:5",
    );
    // A value the column never holds is not trusted.
    expect(productCardRatio({ store_vertical: "abayas", product_card_aspect_ratio: "2:1" })).toBe(
      "3:4",
    );
    expect(productCardRatio(null)).toBe("1:1");
    expect(PRODUCT_PHOTO_CLASS["1:1"]).toBe("aspect-square");
    expect(PRODUCT_PHOTO_CLASS["3:4"]).toBe("aspect-[3/4]");
  });

  it("opens food and coffee on a menu, every other kind of store on a shop", () => {
    expect(verticalHomeLayout("food")).toBe("menu");
    expect(verticalHomeLayout("coffee")).toBe("menu");
    for (const vertical of STORE_VERTICALS.filter((v) => v !== "food" && v !== "coffee")) {
      expect(verticalHomeLayout(vertical), vertical).toBe("shop");
    }
    expect(verticalHomeLayout(null)).toBe("shop");
    expect(verticalHomeLayout("nonsense")).toBe("shop");
  });

  it("opens a store's own home layout, else its vertical's", () => {
    expect(storefrontHomeLayout({ store_vertical: "coffee" })).toBe("menu");
    expect(storefrontHomeLayout({ store_vertical: "coffee", storefront_home_layout: "shop" })).toBe(
      "shop",
    );
    expect(storefrontHomeLayout({ store_vertical: "abayas", storefront_home_layout: "menu" })).toBe(
      "menu",
    );
    // A value the column never holds is not trusted.
    expect(storefrontHomeLayout({ store_vertical: "food", storefront_home_layout: "grid" })).toBe(
      "menu",
    );
    expect(storefrontHomeLayout(null)).toBe("shop");
  });
});
