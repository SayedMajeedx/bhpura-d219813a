import { describe, expect, it } from "vitest";
import {
  extractDigits,
  normalizeSearchQuery,
  buildWhatsAppLink,
  formatTrackingDisplay,
  sanitizeGCCPhone,
} from "../src/lib/os-formatting";

describe("OS Formatting Utilities", () => {
  describe("extractDigits", () => {
    it("handles null, undefined, and empty string gracefully", () => {
      expect(extractDigits(null)).toBe("");
      expect(extractDigits(undefined)).toBe("");
      expect(extractDigits("")).toBe("");
    });

    it("strips out non-digit characters from phone numbers", () => {
      expect(extractDigits("+973 3312-3456")).toBe("97333123456");
      expect(extractDigits("tel: +1 (555) 234-5678")).toBe("15552345678");
    });

    it("normalizes Arabic and Persian numerals to Western digits", () => {
      expect(extractDigits("+٩٧٣ ٣٣١٢٣٤٥٦")).toBe("97333123456");
      expect(extractDigits("۰۱۲۳۴۵۶۷۸۹")).toBe("0123456789");
    });
  });

  describe("normalizeSearchQuery", () => {
    it("handles empty or falsy inputs", () => {
      expect(normalizeSearchQuery("")).toBe("");
      expect(normalizeSearchQuery(null)).toBe("");
      expect(normalizeSearchQuery(undefined)).toBe("");
    });

    it("lowercases and trims inputs, collapsing consecutive spaces", () => {
      expect(normalizeSearchQuery("  Hello   World  ")).toBe("hello world");
      expect(normalizeSearchQuery("  ABAYA 2026  ")).toBe("abaya 2026");
    });
  });

  describe("buildWhatsAppLink", () => {
    it("returns empty string when phone has no digits", () => {
      expect(buildWhatsAppLink("")).toBe("");
      expect(buildWhatsAppLink(null)).toBe("");
      expect(buildWhatsAppLink("---")).toBe("");
    });

    it("builds link without message", () => {
      expect(buildWhatsAppLink("+973 3999 1234")).toBe("https://wa.me/97339991234");
    });

    it("encodes pre-filled message correctly", () => {
      const link = buildWhatsAppLink("97339991234", "مرحباً، بخصوص الطلب #101");
      expect(link).toBe(
        `https://wa.me/97339991234?text=${encodeURIComponent("مرحباً، بخصوص الطلب #101")}`,
      );
    });
  });

  describe("formatTrackingDisplay", () => {
    it("returns dash when both carrier and tracking number are empty", () => {
      expect(formatTrackingDisplay(null, null)).toBe("—");
      expect(formatTrackingDisplay("", "  ")).toBe("—");
    });

    it("formats combined carrier and tracking number", () => {
      expect(formatTrackingDisplay("Aramex", "12345678")).toBe("Aramex - 12345678");
    });

    it("returns single value when one is missing", () => {
      expect(formatTrackingDisplay(null, "12345678")).toBe("12345678");
      expect(formatTrackingDisplay("DHL", "")).toBe("DHL");
    });
  });

  describe("sanitizeGCCPhone", () => {
    it("handles null, undefined, empty, and non-digit inputs gracefully", () => {
      expect(sanitizeGCCPhone(null)).toBeNull();
      expect(sanitizeGCCPhone(undefined)).toBeNull();
      expect(sanitizeGCCPhone("")).toBeNull();
      expect(sanitizeGCCPhone("   ")).toBeNull();
      expect(sanitizeGCCPhone("---")).toBeNull();
    });

    it("formats 8-digit Bahrain phone numbers by adding +973", () => {
      expect(sanitizeGCCPhone("39991234")).toBe("+97339991234");
      expect(sanitizeGCCPhone("17001234")).toBe("+97317001234");
      expect(sanitizeGCCPhone("039991234")).toBe("+97339991234");
    });

    it("formats 9-digit Saudi phone numbers starting with 5 by adding +966", () => {
      expect(sanitizeGCCPhone("501234567")).toBe("+966501234567");
      expect(sanitizeGCCPhone("0501234567")).toBe("+966501234567");
    });

    it("preserves numbers that already start with country code 973 or 966", () => {
      expect(sanitizeGCCPhone("97339991234")).toBe("+97339991234");
      expect(sanitizeGCCPhone("+97339991234")).toBe("+97339991234");
      expect(sanitizeGCCPhone("0097339991234")).toBe("+97339991234");
      expect(sanitizeGCCPhone("966501234567")).toBe("+966501234567");
      expect(sanitizeGCCPhone("+966501234567")).toBe("+966501234567");
    });

    it("cleans extra characters such as dashes, spaces, and parentheses", () => {
      expect(sanitizeGCCPhone("+973 (39) 99-1234")).toBe("+97339991234");
      expect(sanitizeGCCPhone("050-123-4567")).toBe("+966501234567");
    });
  });
});
