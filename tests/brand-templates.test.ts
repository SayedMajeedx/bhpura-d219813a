import { describe, expect, it } from "vitest";
import { STORE_VERTICALS, type StoreVertical } from "../src/lib/store-profile";
import { BRAND_TEMPLATES, getBrandTemplate } from "../src/lib/brand-templates";
import { FONT_MOOD_PRESETS } from "../src/components/settings/QuickThemeCustomizer";

describe("Brand Vertical Templates Registry", () => {
  it("provides a template for every store vertical", () => {
    expect(STORE_VERTICALS.length).toBe(12);
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
        `Template ${vertical} has invalid fontPresetId: ${template.fontPresetId}`
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

  it("provides valid Storefront 2.0 design config to every vertical", () => {
    const validPresets = new Set(["editorial", "fresh", "tech"]);
    const validSpacings = new Set(["airy", "regular", "dense"]);
    const validCardStyles = new Set(["borderless", "bordered"]);

    for (const vertical of STORE_VERTICALS) {
      const template = BRAND_TEMPLATES[vertical];
      expect(template.design, `Template for ${vertical} must have design config`).toBeDefined();
      expect(validPresets.has(template.design!.preset)).toBe(true);
      expect([4, 5]).toContain(template.design!.grid);
      expect(validSpacings.has(template.design!.sectionSpacing)).toBe(true);
      expect(validCardStyles.has(template.design!.cardStyle)).toBe(true);
      expect(template.design!.radius).toBeTruthy();
    }
  });
});
