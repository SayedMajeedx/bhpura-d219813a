import { describe, it, expect } from "vitest";
import { formatSizeWithUnit, splitCompositeVariantSize } from "../src/lib/format";
import { displayVariantParts, formatSkuToken } from "../src/lib/variant-sku-utils";
import { extractVariantsHeuristically } from "../src/lib/generate-variants.functions";
import { translateOptionValue } from "../src/lib/variant-i18n";
import { resolveVariantAxis, resolveAllVariantAxes } from "../src/lib/addons/addon-registry";

describe("Food & Sweets Product Variants Refinement", () => {
  describe("splitCompositeVariantSize", () => {
    it("splits '700 - عادية' with unit 'g' cleanly", () => {
      const res = splitCompositeVariantSize("700 - عادية", "g");
      expect(res.isComposite).toBe(true);
      expect(res.size).toBe("700");
      expect(res.unit).toBe("g");
      expect(res.option).toBe("عادية");
      expect(res.cleanLabelAr).toBe("700 غرام · عادية");
      expect(res.cleanLabelEn).toBe("700g · عادية");
    });

    it("splits '700 - بدون سكر' with unit 'g' cleanly", () => {
      const res = splitCompositeVariantSize("700 - بدون سكر", "g");
      expect(res.isComposite).toBe(true);
      expect(res.size).toBe("700");
      expect(res.unit).toBe("g");
      expect(res.option).toBe("بدون سكر");
      expect(res.cleanLabelAr).toBe("700 غرام · بدون سكر");
    });

    it("extracts embedded unit from '700g - بدون سكر'", () => {
      const res = splitCompositeVariantSize("700g - بدون سكر");
      expect(res.isComposite).toBe(true);
      expect(res.size).toBe("700");
      expect(res.unit).toBe("g");
      expect(res.option).toBe("بدون سكر");
      expect(res.cleanLabelAr).toBe("700 غرام · بدون سكر");
    });

    it("returns false isComposite for normal single numeric or text size", () => {
      const res = splitCompositeVariantSize("700", "g");
      expect(res.isComposite).toBe(false);
      expect(res.size).toBe("700");
      expect(res.unit).toBe("g");
      expect(res.option).toBe("");
    });
  });

  describe("formatSizeWithUnit with composite strings", () => {
    it("formats '700 - عادية' with unit 'g' without appending awkward 'غرام' at the end", () => {
      const formatted = formatSizeWithUnit("700 - عادية", "g", "ar");
      expect(formatted).toBe("700 غرام · عادية");
      expect(formatted).not.toContain("عادية غرام");
    });

    it("formats standard clean '700' with 'g' correctly", () => {
      expect(formatSizeWithUnit("700", "g", "ar")).toBe("700 غرام");
      expect(formatSizeWithUnit("700", "g", "en")).toBe("700g");
    });
  });

  describe("displayVariantParts", () => {
    it("separates composite size into size and option parts when color is null", () => {
      const parts = displayVariantParts(
        { size: "700 - بدون سكر", size_unit: "g", color: null },
        "ar",
      );
      expect(parts).toEqual(["700 غرام", "بدون سكر"]);
    });

    it("handles clean separated size and color properly", () => {
      const parts = displayVariantParts({ size: "700", size_unit: "g", color: "عادية" }, "ar");
      expect(parts).toEqual(["700 غرام", "عادية"]);
    });
  });

  describe("formatSkuToken for flavors & retail options", () => {
    it("converts common Arabic and English food options to standardized tokens", () => {
      expect(formatSkuToken("عادية")).toBe("REG");
      expect(formatSkuToken("بدون سكر")).toBe("SF");
      expect(formatSkuToken("فستق")).toBe("PST");
      expect(formatSkuToken("زعفران")).toBe("SAF");
      expect(formatSkuToken("كلاسيك")).toBe("CLS");
      expect(formatSkuToken("Regular")).toBe("REG");
      expect(formatSkuToken("Sugar Free")).toBe("SF");
    });
  });

  describe("Offline Heuristic NLP Parser for Food / Sweets prompts", () => {
    it("accurately extracts user's exact multi-option prompt", () => {
      const prompt =
        "كل منتج منهم عندي منه نكهة عادية و بدون سكر, و ثنينهم 700 غرام, السعر 8.5 والمخزون 100";
      const result = extractVariantsHeuristically(prompt, "ar");

      expect(result.sizes).toContain("700");
      expect(result.size_unit).toBe("g");
      expect(result.colors).toContain("عادية");
      expect(result.colors).toContain("بدون سكر");
      expect(result.selling_price).toBe(8.5);
      expect(result.stock_main).toBe(100);
    });
  });

  describe("Bilingual Variant Options Translation Engine", () => {
    it("translates common Arabic food/sweets options to English", () => {
      expect(translateOptionValue("عادية", "en")).toBe("Regular");
      expect(translateOptionValue("بدون سكر", "en")).toBe("Sugar Free");
      expect(translateOptionValue("فستق", "en")).toBe("Pistachio");
      expect(translateOptionValue("زعفران", "en")).toBe("Saffron");
      expect(translateOptionValue("بوكس فاخر", "en")).toBe("Luxury Box");
      expect(translateOptionValue("علبة قصدير", "en")).toBe("Tin Box");
    });

    it("translates common English food/sweets options to Arabic", () => {
      expect(translateOptionValue("Regular", "ar")).toBe("عادية");
      expect(translateOptionValue("Sugar Free", "ar")).toBe("بدون سكر");
      expect(translateOptionValue("Pistachio", "ar")).toBe("فستق");
    });

    it("extracts language from bilingual slash or parenthesis notation", () => {
      expect(translateOptionValue("عادية / Regular", "en")).toBe("Regular");
      expect(translateOptionValue("عادية / Regular", "ar")).toBe("عادية");
      expect(translateOptionValue("بدون سكر (Sugar Free)", "en")).toBe("Sugar Free");
      expect(translateOptionValue("بدون سكر (Sugar Free)", "ar")).toBe("بدون سكر");
    });

    it("safely handles null/undefined or unknown words by preserving original text", () => {
      expect(translateOptionValue(null, "en")).toBe("");
      expect(translateOptionValue("", "en")).toBe("");
      expect(translateOptionValue("CustomBrandFlavor123", "en")).toBe("CustomBrandFlavor123");
    });
  });

  describe("Storefront & Inventory Variant Axis Visibility with Merchant Data", () => {
    // In Food & Sweets vertical, fabric is defaulted to null/disabled:
    const foodAddonDefaults = {
      size: { labelAr: "الحجم / الوزن", labelEn: "Size / Weight", placeholderAr: "مثال: 500g", placeholderEn: "e.g. 500g" },
      color: { labelAr: "النكهة / الخيار", labelEn: "Flavor / Option", placeholderAr: "مثال: فستق", placeholderEn: "e.g. Pistachio" },
      fabric: null, // Disabled by default for food
      four: null,
      five: null,
    };

    it("makes fabric visible when merchant variants have fabric data", () => {
      const product = {
        id: "prod-1",
        variant_label_fabric_ar: "الخامة",
        variant_label_fabric_en: "Material",
        product_variants: [
          { size: "700", color: "عادية", fabric: "حرير" },
          { size: "700", color: "بدون سكر", fabric: "حرير" },
        ],
      };

      const fabricAxis = resolveVariantAxis({
        axis: "fabric",
        product,
        addonDefaults: foodAddonDefaults,
        lang: "ar",
      });

      expect(fabricAxis.visible).toBe(true);
      expect(fabricAxis.label).toBe("الخامة");
    });

    it("keeps fabric hidden if no variants have fabric data in food vertical", () => {
      const product = {
        id: "prod-2",
        product_variants: [
          { size: "700", color: "عادية", fabric: null },
          { size: "700", color: "بدون سكر", fabric: "" },
        ],
      };

      const fabricAxis = resolveVariantAxis({
        axis: "fabric",
        product,
        addonDefaults: foodAddonDefaults,
        lang: "ar",
      });

      expect(fabricAxis.visible).toBe(false);
    });

    it("resolveAllVariantAxes exposes fabric when variants have fabric values", () => {
      const product = {
        id: "prod-1",
        variant_label_fabric_ar: "الخامة",
        variant_label_fabric_en: "Material",
        product_variants: [
          { size: "700", color: "عادية", fabric: "حرير" },
        ],
      };

      const allAxes = resolveAllVariantAxes({
        product,
        addonDefaults: foodAddonDefaults,
        lang: "ar",
      });

      expect(allAxes.size.visible).toBe(true);
      expect(allAxes.color.visible).toBe(true);
      expect(allAxes.fabric.visible).toBe(true);
      expect(allAxes.fabric.label).toBe("الخامة");
    });
  });
});
