import { describe, it, expect } from "vitest";
import {
  translateOptionValue,
  hasKnownTranslation,
  getUntranslatedTerms,
  registerDynamicTranslations,
  parseBilingualOption,
} from "../src/lib/variant-i18n";

describe("Autonomous Variant i18n Translation Engine", () => {
  describe("Tier 1: High-Precision Commercial Retail Lexicon", () => {
    it("translates common fabrics accurately to English", () => {
      expect(translateOptionValue("حرير", "en")).toBe("Silk");
      expect(translateOptionValue("شيفون", "en")).toBe("Chiffon");
      expect(translateOptionValue("كتان", "en")).toBe("Linen");
      expect(translateOptionValue("قطن", "en")).toBe("Cotton");
      expect(translateOptionValue("صوف", "en")).toBe("Wool");
      expect(translateOptionValue("مخمل", "en")).toBe("Velvet");
      expect(translateOptionValue("ساتان", "en")).toBe("Satin");
      expect(translateOptionValue("كريب", "en")).toBe("Crepe");
      expect(translateOptionValue("دانتيل", "en")).toBe("Lace");
      expect(translateOptionValue("كشمير", "en")).toBe("Cashmere");
    });

    it("translates food, sweets and nuts to English", () => {
      expect(translateOptionValue("فستق", "en")).toBe("Pistachio");
      expect(translateOptionValue("بستاشيو", "en")).toBe("Pistachio");
      expect(translateOptionValue("عادية", "en")).toBe("Regular");
      expect(translateOptionValue("بدون سكر", "en")).toBe("Sugar Free");
      expect(translateOptionValue("شوكولاتة داكنة", "en")).toBe("Dark Chocolate");
      expect(translateOptionValue("كراميل مملح", "en")).toBe("Salted Caramel");
      expect(translateOptionValue("لوتس مقرمش", "en")).toBe("Crunchy Lotus");
    });

    it("translates colors and shades to English", () => {
      expect(translateOptionValue("أسود", "en")).toBe("Black");
      expect(translateOptionValue("كحلي", "en")).toBe("Navy");
      expect(translateOptionValue("زيتي", "en")).toBe("Olive");
      expect(translateOptionValue("عنابي", "en")).toBe("Burgundy");
      expect(translateOptionValue("أوفوايت", "en")).toBe("Off-White");
    });

    it("inverts English words to Arabic accurately", () => {
      expect(translateOptionValue("Silk", "ar")).toBe("حرير");
      expect(translateOptionValue("Chiffon", "ar")).toBe("شيفون");
      expect(translateOptionValue("Linen", "ar")).toBe("كتان");
      expect(translateOptionValue("Sugar Free", "ar")).toBe("بدون سكر");
      expect(translateOptionValue("Pistachio", "ar")).toBe("فستق");
    });
  });

  describe("Tier 2: Smart Compound Phrase & Modifier Tokenizer", () => {
    it("resolves Noun + Adjective compound options", () => {
      expect(translateOptionValue("حرير طبيعي", "en")).toBe("Natural Silk");
      expect(translateOptionValue("كتان بارد", "en")).toBe("Cool Linen");
      expect(translateOptionValue("أزرق داكن", "en")).toBe("Dark Blue");
      expect(translateOptionValue("وردي فاتح", "en")).toBe("Light Pink");
      expect(translateOptionValue("شوكولاتة بالحليب", "en")).toBe("Milk Chocolate");
    });

    it("handles definite article prefix 'ال'", () => {
      expect(translateOptionValue("الحرير", "en")).toBe("Silk");
      expect(translateOptionValue("الكتان", "en")).toBe("Linen");
    });

    it("handles dual bilingual notation (/ and ())", () => {
      expect(parseBilingualOption("حرير / Silk")).toEqual({ ar: "حرير", en: "Silk" });
      expect(translateOptionValue("حرير / Silk", "en")).toBe("Silk");
      expect(translateOptionValue("حرير / Silk", "ar")).toBe("حرير");
      expect(translateOptionValue("بدون سكر (Sugar Free)", "en")).toBe("Sugar Free");
    });
  });

  describe("Tier 3: Dynamic Runtime & Server Translation Cache", () => {
    it("registers dynamic translations and retrieves them synchronously", () => {
      const customTerm = "نكهة سحرية تجريبية";
      expect(hasKnownTranslation(customTerm, "en")).toBe(false);

      registerDynamicTranslations({ [customTerm]: "Magical Mystery Flavor" }, "en");

      expect(translateOptionValue(customTerm, "en")).toBe("Magical Mystery Flavor");
      expect(hasKnownTranslation(customTerm, "en")).toBe(true);
    });

    it("accurately detects and filters untranslated terms for batch translation", () => {
      const list = ["حرير", "بدون سكر", "نكهة جديدة تماماً 123", "صوف"];
      const untranslated = getUntranslatedTerms(list, "en");

      expect(untranslated).toEqual(["نكهة جديدة تماماً 123"]);
    });
  });
});
