import { describe, expect, it } from "vitest";
import {
  formatMoney,
  formatDate,
  formatOrderStatus,
  formatSizeWithUnit,
  toWesternDigits,
  westernNumeralLocale,
} from "../src/lib/format";

const easternDigits = /[٠-٩۰-۹]/;

describe("Formatting Utilities Behavioral Suite", () => {
  describe("formatMoney Precision & Locale Currency Handling", () => {
    it("formats 3-decimal currencies (BHD, KWD, OMR) with exactly 3 fraction digits", () => {
      const bhd = formatMoney(15.5, "BHD", "en-BH");
      expect(bhd).toContain("15.500");

      const kwd = formatMoney(10.1234, "KWD", "en-KW");
      expect(kwd).toContain("10.123");

      const omr = formatMoney(7, "OMR", "ar-OM");
      expect(omr).toContain("7.000");
    });

    it("formats 2-decimal currencies (SAR, AED, USD, EUR) with exactly 2 fraction digits", () => {
      const sar = formatMoney(100.5, "SAR", "ar-SA");
      expect(sar).toContain("100.50");

      const aed = formatMoney(49.999, "AED", "en-AE");
      expect(aed).toContain("50.00");

      const usd = formatMoney(25, "USD", "en-US");
      expect(usd).toContain("25.00");
    });

    it("enforces Western numerals across all Arabic locales", () => {
      expect(formatMoney(25.75, "BHD", "ar-BH")).not.toMatch(easternDigits);
      expect(formatMoney(100, "SAR", "ar-SA")).not.toMatch(easternDigits);
      expect(formatMoney(50, "AED", "ar-AE")).not.toMatch(easternDigits);
    });

    it("handles zero, negative numbers, and null/NaN values safely", () => {
      expect(formatMoney(0, "BHD")).toContain("0.000");
      const negativeBhd = formatMoney(-15.2, "BHD");
      expect(negativeBhd).toContain("15.200");
      expect(negativeBhd).toContain("-");
      expect(formatMoney(null as any, "BHD")).toContain("0.000");
      expect(formatMoney(undefined as any, "BHD")).toContain("0.000");
      expect(formatMoney(NaN, "BHD")).toContain("0.000");
    });
  });

  describe("formatDate Precision", () => {
    it("formats date strings without UTC day-shifting", () => {
      const formatted = formatDate("2026-07-24", "en-BH");
      expect(formatted).toContain("2026");
      expect(formatted).toContain("24");
      expect(formatted).toContain("07");
    });

    it("enforces Western numerals for dates in Arabic locales", () => {
      const formatted = formatDate("2026-07-24", "ar-BH");
      expect(formatted).not.toMatch(easternDigits);
      expect(formatted).toContain("2026");
      expect(formatted).toContain("24");
      expect(formatted).toContain("07");
    });

    it("returns dash for null, undefined, or invalid date values", () => {
      expect(formatDate(null)).toBe("—");
      expect(formatDate(undefined)).toBe("—");
      expect(formatDate("invalid-date")).toBe("—");
    });
  });

  describe("formatOrderStatus Contextual Labeling", () => {
    it("contextualizes 'shipped' status by fulfillment method", () => {
      // Pickup
      expect(formatOrderStatus("shipped", "pickup", "en")).toBe("Ready for Pickup");
      expect(formatOrderStatus("shipped", "pickup", "ar")).toBe("جاهز للاستلام");

      // Digital
      expect(formatOrderStatus("shipped", "digital", "en")).toBe("Sent / Delivered");
      expect(formatOrderStatus("shipped", "digital", "ar")).toBe("تم الإرسال / التسليم");

      // Delivery
      expect(formatOrderStatus("shipped", "delivery", "en")).toBe("Shipped / Out for Delivery");
      expect(formatOrderStatus("shipped", "delivery", "ar")).toBe("تم الشحن / التوصيل");
    });

    it("falls back to standard status labels for non-shipped statuses", () => {
      expect(formatOrderStatus("completed", "delivery", "en")).toBe("Completed");
      expect(formatOrderStatus("cancelled", "pickup", "ar")).toBe("ملغى");
    });
  });

  describe("formatSizeWithUnit Translation & Formatting", () => {
    it("translates units to Arabic in Arabic locale", () => {
      // Arabic renders full unit names separated by a space (matches storefront labels).
      expect(formatSizeWithUnit("54", "cm", "ar")).toBe("54 سم");
      expect(formatSizeWithUnit("1.5", "m", "ar")).toBe("1.5 م");
      expect(formatSizeWithUnit("2", "kg", "ar")).toBe("2 كيلوغرام");
      expect(formatSizeWithUnit("250", "g", "ar")).toBe("250 غرام");
      expect(formatSizeWithUnit("32", "inch", "ar")).toBe("32 إنش");
    });

    it("preserves units in English locale", () => {
      expect(formatSizeWithUnit("54", "cm", "en")).toBe("54cm");
      expect(formatSizeWithUnit("2", "kg", "en")).toBe("2kg");
    });

    it("handles missing size or unit gracefully", () => {
      expect(formatSizeWithUnit("", "cm", "ar")).toBe("");
      // A unit-less descriptor is translated through the variant option lexicon.
      expect(formatSizeWithUnit("XL", null, "ar")).toBe("كبير جداً");
      expect(formatSizeWithUnit("XL", null, "en")).toBe("XL");
      expect(formatSizeWithUnit(null, null, "ar")).toBe("");
    });
  });

  describe("Numeral Normalization", () => {
    it("normalizes Arabic and Persian numerals to Western digits", () => {
      expect(toWesternDigits("١٢٣.٤٥٦")).toBe("123.456");
      expect(toWesternDigits("۰۱۲۳۴۵۶۷۸۹")).toBe("0123456789");
    });

    it("configures Latin numbering system in westernNumeralLocale", () => {
      expect(westernNumeralLocale("ar-BH")).toContain("nu-latn");
      expect(westernNumeralLocale("ar-SA")).toContain("nu-latn");
    });
  });
});
