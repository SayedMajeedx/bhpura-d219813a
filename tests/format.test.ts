import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatMoney,
  formatSizeWithUnit,
  toWesternDigits,
  westernNumeralLocale,
} from "../src/lib/format";

const easternDigits = /[٠-٩۰-۹]/;

describe("Western numeral formatting", () => {
  it("forces the Latin numbering system for Arabic locales", () => {
    expect(westernNumeralLocale("ar-BH")).toContain("nu-latn");
    expect(formatMoney(15, "BHD", "ar-BH")).not.toMatch(easternDigits);
    expect(formatDate("2026-07-24", "ar-BH")).not.toMatch(easternDigits);
  });

  it("normalizes Arabic and Persian digit characters", () => {
    expect(toWesternDigits("١٥.٠٠٠ BHD · #۱۰۶۸")).toBe("15.000 BHD · #1068");
  });
});

describe("formatSizeWithUnit", () => {
  it("formats weight and dimensions in Arabic", () => {
    expect(formatSizeWithUnit("250", "g", "ar")).toBe("250 غرام");
    expect(formatSizeWithUnit("1", "kg", "ar")).toBe("1 كيلوغرام");
    expect(formatSizeWithUnit("52", "inch", "ar")).toBe("52 إنش");
    expect(formatSizeWithUnit("100", "ml", "ar")).toBe("100 مل");
    expect(formatSizeWithUnit("1.5", "l", "ar")).toBe("1.5 لتر");
    expect(formatSizeWithUnit("10", "cm", "ar")).toBe("10 سم");
  });

  it("formats weight and dimensions in English", () => {
    expect(formatSizeWithUnit("250", "g", "en")).toBe("250g");
    expect(formatSizeWithUnit("1", "kg", "en")).toBe("1kg");
    expect(formatSizeWithUnit("52", "inch", "en")).toBe("52 inch");
    expect(formatSizeWithUnit("100", "ml", "en")).toBe("100ml");
  });

  it("handles idempotent calls without duplicating units", () => {
    expect(formatSizeWithUnit("250 غرام", "g", "ar")).toBe("250 غرام");
    expect(formatSizeWithUnit("250g", "g", "en")).toBe("250g");
    expect(formatSizeWithUnit("52 إنش", "inch", "ar")).toBe("52 إنش");
  });

  it("handles missing or empty sizes/units gracefully", () => {
    expect(formatSizeWithUnit("250", null, "ar")).toBe("250");
    expect(formatSizeWithUnit("250", "", "ar")).toBe("250");
    expect(formatSizeWithUnit(null, "g", "ar")).toBe("");
    expect(formatSizeWithUnit(undefined, "g", "ar")).toBe("");
  });
});
