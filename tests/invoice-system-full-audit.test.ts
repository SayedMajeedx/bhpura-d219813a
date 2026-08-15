import { describe, it, expect } from "vitest";
import { formatAddressDetailed, type StructuredAddress } from "../src/lib/bahrain-regions";
import { resolvePaymentStatus, PAYMENT_BADGE_LABEL } from "../src/lib/payment-status";
import { getInvoiceStatusLabel } from "../src/lib/status-labels";
import { formatMoney, formatDate } from "../src/lib/format";

describe("Full Invoice System Functional & Layout Audit", () => {
  it("formats Bahrain structured addresses accurately in both Arabic and English", () => {
    const addr: StructuredAddress = {
      house: "123",
      road: "45",
      block: "789",
      flat: "12",
      region: "riffa",
    };

    const arAddress = formatAddressDetailed(addr, "ar");
    expect(arAddress).toContain("منزل: 123");
    expect(arAddress).toContain("طريق: 45");
    expect(arAddress).toContain("المجمع: 789");
    expect(arAddress).toContain("شقة: 12");
    expect(arAddress).toContain("الرفاع");

    const enAddress = formatAddressDetailed(addr, "en");
    expect(enAddress).toContain("House: 123");
    expect(enAddress).toContain("Road: 45");
    expect(enAddress).toContain("Block: 789");
    expect(enAddress).toContain("Flat: 12");
    expect(enAddress).toContain("Riffa");
  });

  it("correctly resolves payment status badges and localized labels", () => {
    // Paid in full
    const paidBadge = resolvePaymentStatus("paid", "completed", 100, 100);
    expect(paidBadge).toBe("paid");
    expect(PAYMENT_BADGE_LABEL[paidBadge].ar).toBe("مدفوع");
    expect(PAYMENT_BADGE_LABEL[paidBadge].en).toBe("Paid");

    // Partial advance payment
    const partialBadge = resolvePaymentStatus(null, "pending", 100, 40);
    expect(partialBadge).toBe("partial");
    expect(PAYMENT_BADGE_LABEL[partialBadge].ar).toBe("مدفوع جزئياً");
    expect(PAYMENT_BADGE_LABEL[partialBadge].en).toBe("Partially Paid");

    // Unpaid
    const unpaidBadge = resolvePaymentStatus(null, "pending", 100, 0);
    expect(unpaidBadge).toBe("unpaid");
    expect(PAYMENT_BADGE_LABEL[unpaidBadge].ar).toBe("غير مدفوع");
    expect(PAYMENT_BADGE_LABEL[unpaidBadge].en).toBe("Unpaid");
  });

  it("returns localized invoice status labels across fulfillment states", () => {
    expect(getInvoiceStatusLabel("pending", "ar")).toBe("قيد الانتظار");
    expect(getInvoiceStatusLabel("pending", "en")).toBe("Pending");

    expect(getInvoiceStatusLabel("sent_to_tailor", "ar")).toBe("قيد التفصيل بكل حب");
    expect(getInvoiceStatusLabel("sent_to_tailor", "en")).toBe("Tailoring with Love");

    expect(getInvoiceStatusLabel("received_from_tailor", "ar")).toBe("قيد التجهيز والتغليف");
    expect(getInvoiceStatusLabel("received_from_tailor", "en")).toBe(
      "Under Preparation & Packaging",
    );

    expect(getInvoiceStatusLabel("completed", "ar")).toBe("مكتمل");
    expect(getInvoiceStatusLabel("completed", "en")).toBe("Completed");
  });

  it("formats BHD currency correctly without corrupting Latin numerals in Arabic locale", () => {
    const formattedAr = formatMoney(12.5, "BHD", "ar-BH-u-nu-latn");
    expect(formattedAr).toContain("12.500");
    expect(formattedAr).toContain("د.ب");

    const formattedEn = formatMoney(12.5, "BHD", "en-BH");
    expect(formattedEn).toContain("12.500");
  });

  it("formats order dates properly for invoices", () => {
    const dateStr = "2026-08-15T12:00:00.000Z";
    const dateAr = formatDate(dateStr, "ar-BH-u-nu-latn");
    const dateEn = formatDate(dateStr, "en-BH");

    expect(dateAr).toBeTruthy();
    expect(dateEn).toBeTruthy();
  });
});
