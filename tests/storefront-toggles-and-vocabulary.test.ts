import { describe, it, expect } from "vitest";
import {
  DEFAULT_VOCABULARY,
  resolveVocabulary,
  getVerticalVocabularyOverrides,
} from "../src/lib/store-vocabulary";

describe("Storefront 2.0 Toggles & Feature Gating Logic", () => {
  // Helper simulating the defensive toggle check used across Storefront 2.0
  const isFeatureEnabled = (settingValue: boolean | undefined | null) => settingValue !== false;

  it("defaults all Storefront 2.0 switches to enabled when undefined or null (backwards compatibility)", () => {
    const rawSettingsFromLegacyDb: Record<string, any> = {
      brand_story_enabled: null,
      social_proof_enabled: undefined,
      recently_viewed_enabled: null,
      product_card_hover_image: undefined,
      product_card_color_dots: null,
      product_card_quick_add: undefined,
      quick_view_enabled: null,
      pdp_image_zoom: undefined,
      category_filters_enabled: null,
      back_in_stock_enabled: undefined,
      trust_bar_enabled: null,
    };

    for (const [key, val] of Object.entries(rawSettingsFromLegacyDb)) {
      expect(isFeatureEnabled(val), `Key "${key}" should default to true`).toBe(true);
    }
  });

  it("strictly disables the feature when explicitly set to false in business_settings", () => {
    const disabledSettings: Record<string, any> = {
      brand_story_enabled: false,
      social_proof_enabled: false,
      recently_viewed_enabled: false,
      product_card_hover_image: false,
      product_card_color_dots: false,
      product_card_quick_add: false,
      quick_view_enabled: false,
      pdp_image_zoom: false,
      category_filters_enabled: false,
      back_in_stock_enabled: false,
      trust_bar_enabled: false,
    };

    for (const [key, val] of Object.entries(disabledSettings)) {
      expect(isFeatureEnabled(val), `Key "${key}" should evaluate to false`).toBe(false);
    }
  });

  describe("Trust Bar Positioning Evaluation", () => {
    const evaluateTrustBar = (settings: {
      trust_bar_enabled?: boolean | null;
      trust_bar_position?: string | null;
    }) => {
      const isEnabled = settings?.trust_bar_enabled !== false;
      const pos = settings?.trust_bar_position;

      const showBelowHero = isEnabled && (pos === "below_hero" || pos === "both" || !pos);
      const showAboveFooter = isEnabled && (pos === "above_footer" || pos === "both");

      return { showBelowHero, showAboveFooter };
    };

    it("defaults to below_hero when position is unset/undefined", () => {
      const res = evaluateTrustBar({});
      expect(res.showBelowHero).toBe(true);
      expect(res.showAboveFooter).toBe(false);
    });

    it("handles explicit below_hero positioning", () => {
      const res = evaluateTrustBar({ trust_bar_position: "below_hero" });
      expect(res.showBelowHero).toBe(true);
      expect(res.showAboveFooter).toBe(false);
    });

    it("handles explicit above_footer positioning", () => {
      const res = evaluateTrustBar({ trust_bar_position: "above_footer" });
      expect(res.showBelowHero).toBe(false);
      expect(res.showAboveFooter).toBe(true);
    });

    it("handles both positions simultaneously", () => {
      const res = evaluateTrustBar({ trust_bar_position: "both" });
      expect(res.showBelowHero).toBe(true);
      expect(res.showAboveFooter).toBe(true);
    });

    it("disables both locations when trust_bar_enabled is false regardless of position value", () => {
      const res = evaluateTrustBar({ trust_bar_enabled: false, trust_bar_position: "both" });
      expect(res.showBelowHero).toBe(false);
      expect(res.showAboveFooter).toBe(false);
    });
  });

  describe("Vertical-Aware Fabric & Care Fallback Logic", () => {
    const resolveFabricCare = ({
      storeVertical,
      customCare,
      isAr = true,
    }: {
      storeVertical?: string | null;
      customCare?: string | null;
      isAr?: boolean;
    }) => {
      const v = (storeVertical || "general").toLowerCase();
      const isApparel = ["fashion", "abayas", "clothing", "apparel"].includes(v);
      const defaultApparelCare = isApparel
        ? isAr
          ? "يُغسل باليد بماء بارد أو تنظيف جاف"
          : "Hand wash cold or dry clean only"
        : null;

      return customCare || defaultApparelCare;
    };

    it("provides fashion laundry defaults for fashion/abayas verticals when no custom care is supplied", () => {
      const arCare = resolveFabricCare({ storeVertical: "abayas" });
      expect(arCare).toContain("يُغسل باليد");

      const enCare = resolveFabricCare({ storeVertical: "fashion", isAr: false });
      expect(enCare).toContain("Hand wash cold");
    });

    it("does NOT supply abaya/garment care for coffee or food verticals by default", () => {
      const coffeeCare = resolveFabricCare({ storeVertical: "coffee" });
      expect(coffeeCare).toBeNull();

      const foodCare = resolveFabricCare({ storeVertical: "food" });
      expect(foodCare).toBeNull();

      const generalCare = resolveFabricCare({ storeVertical: "general" });
      expect(generalCare).toBeNull();
    });

    it("honours custom merchant care/specifications text regardless of the vertical", () => {
      const customSpecs = "تُحفظ حبوب القهوة في مكان جاف وبارد بعيداً عن أشعة الشمس";
      const coffeeWithCustomCare = resolveFabricCare({
        storeVertical: "coffee",
        customCare: customSpecs,
      });
      expect(coffeeWithCustomCare).toBe(customSpecs);
    });
  });

  describe("Store Vocabulary & Inclusivity", () => {
    it("provides neutral defaults in DEFAULT_VOCABULARY", () => {
      expect(DEFAULT_VOCABULARY.product_noun.ar).toBe("المنتج");
      expect(DEFAULT_VOCABULARY.collections_noun.ar).toBe("التشكيلات");
      expect(DEFAULT_VOCABULARY.specifications_label.ar).toBe("المواصفات والتفاصيل");
      expect(DEFAULT_VOCABULARY.care_instructions_label.ar).toBe("العناية والاستخدام");
    });

    it("supplies tailored overrides for non-apparel verticals like coffee", () => {
      const coffeeOverrides = getVerticalVocabularyOverrides("coffee");
      const resolved = resolveVocabulary(DEFAULT_VOCABULARY, coffeeOverrides);

      expect(resolved.specifications_label.ar).toBe("المكونات والتحضير");
      expect(resolved.care_instructions_label.ar).toBe("إرشادات الحفظ والتقديم");
      expect(resolved.sizing_guide.ar).toBe("دليل الأحجام والأوزان");
      expect(resolved.variant_picker_prompt.ar).toBe("اختر الحجم أو الوزن");
    });

    it("supplies tailored overrides for perfume/beauty verticals", () => {
      const perfumeOverrides = getVerticalVocabularyOverrides("perfumes");
      const resolved = resolveVocabulary(DEFAULT_VOCABULARY, perfumeOverrides);

      expect(resolved.specifications_label.ar).toBe("المكونات العطرية");
      expect(resolved.care_instructions_label.ar).toBe("إرشادات الاستخدام");
      expect(resolved.variant_picker_prompt.ar).toBe("اختر الحجم أو العبوة");
    });

    it("supplies tailored overrides for electronics verticals", () => {
      const electronicsOverrides = getVerticalVocabularyOverrides("electronics");
      const resolved = resolveVocabulary(DEFAULT_VOCABULARY, electronicsOverrides);

      expect(resolved.specifications_label.ar).toBe("المواصفات التقنية");
      expect(resolved.care_instructions_label.ar).toBe("إرشادات التشغيل والضمان");
      expect(resolved.variant_picker_prompt.ar).toBe("اختر الطراز أو السعة");
    });
  });
});
