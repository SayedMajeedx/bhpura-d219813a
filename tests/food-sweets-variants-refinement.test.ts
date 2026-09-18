import { describe, it, expect } from "vitest";
import { formatSizeWithUnit, splitCompositeVariantSize } from "../src/lib/format";
import {
  displayVariantParts,
  formatSkuToken,
} from "../src/lib/variant-sku-utils";
import { extractVariantsHeuristically } from "../src/lib/generate-variants.functions";

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
      const parts = displayVariantParts(
        { size: "700", size_unit: "g", color: "عادية" },
        "ar",
      );
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
});
