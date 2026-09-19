import { describe, expect, it } from "vitest";
import {
  sanitizeForCsv,
  sanitizeCellValue,
  PRODUCT_PRESETS,
  CUSTOMER_PRESETS,
  ORDER_PRESETS,
} from "../src/lib/universal-exporter";

describe("universal-exporter sanitization & formula injection defense (CWE-1236)", () => {
  it("prepends a single quote to neutralize formula injection triggers", () => {
    expect(sanitizeForCsv("=SUM(A1:B10)")).toBe("'=SUM(A1:B10)");
    expect(sanitizeForCsv("+12345")).toBe("'+12345");
    expect(sanitizeForCsv("-cmd|'/C calc'!A0")).toBe("'-cmd|'/C calc'!A0");
    expect(sanitizeForCsv("@malicious")).toBe("'@malicious");
    expect(sanitizeForCsv("\tcmd")).toBe("'\tcmd");
  });

  it("escapes quotes, commas, and newlines per RFC 4180", () => {
    expect(sanitizeForCsv('Text with "quotes"')).toBe('"Text with ""quotes"""');
    expect(sanitizeForCsv("Text, with comma")).toBe('"Text, with comma"');
    expect(sanitizeForCsv("Text with\nnewline")).toBe('"Text with\nnewline"');
  });

  it("safely passes standard non-dangerous text and numbers", () => {
    expect(sanitizeForCsv("Abaya Silk")).toBe("Abaya Silk");
    expect(sanitizeForCsv(45.5)).toBe("45.5");
    expect(sanitizeForCsv(null)).toBe("");
    expect(sanitizeForCsv(undefined)).toBe("");
  });

  it("protects Excel cell values against formula injection", () => {
    expect(sanitizeCellValue("=HYPERLINK(\"http://evil.com\")")).toBe("'=HYPERLINK(\"http://evil.com\")");
    expect(sanitizeCellValue(100)).toBe(100);
    expect(sanitizeCellValue(true)).toBe(true);
  });
});

describe("universal-exporter presets integrity", () => {
  it("contains all expected product presets with valid columns", () => {
    const ids = PRODUCT_PRESETS.map((p) => p.id);
    expect(ids).toContain("boutq_master");
    expect(ids).toContain("shopify_compatible");
    expect(ids).toContain("salla_zid");
    expect(ids).toContain("inventory_valuation");

    const shopifyPreset = PRODUCT_PRESETS.find((p) => p.id === "shopify_compatible");
    const shopifyKeys = shopifyPreset?.columns.map((c) => c.key);
    expect(shopifyKeys).toContain("handle");
    expect(shopifyKeys).toContain("variant_sku");
    expect(shopifyKeys).toContain("variant_price");
  });

  it("contains customer presets including WhatsApp marketing format", () => {
    const ids = CUSTOMER_PRESETS.map((p) => p.id);
    expect(ids).toContain("crm_full");
    expect(ids).toContain("whatsapp_campaign");
    expect(ids).toContain("vip_spenders");
  });

  it("contains order presets including Accounting & Tax ledger", () => {
    const ids = ORDER_PRESETS.map((p) => p.id);
    expect(ids).toContain("orders_summary");
    expect(ids).toContain("orders_line_items");
    expect(ids).toContain("accounting_ledger");
  });
});
