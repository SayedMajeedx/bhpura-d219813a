import { describe, expect, it } from "vitest";
import {
  getStoredPaymentMethodPresentation,
  matchesPaymentMethodFilter,
  normalizePaymentMethod,
} from "../src/lib/payment-method";

describe("payment method filtering", () => {
  it.each([
    ["benefit", "benefit"],
    ["benefit_pay", "benefit"],
    ["cod", "cod"],
    ["cash_on_delivery", "cod"],
    ["card", "card"],
    ["tap", "card"],
  ] as const)("normalizes %s as %s", (storedValue, expected) => {
    expect(normalizePaymentMethod(storedValue)).toBe(expected);
  });

  it.each([
    ["benefit", "benefit", true],
    ["benefit", "cod", false],
    ["cod", "cod", true],
    ["cod", "card", false],
    ["card", "card", true],
    ["card", "benefit", false],
    ["imported_migration", "benefit", false],
    [null, "card", false],
  ] as const)("filters %s by %s accurately", (storedValue, filter, expected) => {
    expect(matchesPaymentMethodFilter(storedValue, filter)).toBe(expected);
  });

  it("includes every payment method when All is selected", () => {
    expect(matchesPaymentMethodFilter("benefit", "all")).toBe(true);
    expect(matchesPaymentMethodFilter("cod", "all")).toBe(true);
    expect(matchesPaymentMethodFilter("card", "all")).toBe(true);
    expect(matchesPaymentMethodFilter(null, "all")).toBe(true);
  });

  it.each([
    ["card", "ar", "بطاقة"],
    ["tap", "en", "Card"],
    ["benefit", "ar", "بنفت"],
    ["benefit_pay", "en", "Benefit"],
    ["cod", "ar", "الدفع عند الاستلام"],
    ["cash_on_delivery", "en", "Cash on Delivery"],
  ] as const)("localizes stored method %s in %s", (stored, lang, expected) => {
    expect(getStoredPaymentMethodPresentation(stored, lang)).toMatchObject({
      label: expected,
      recognized: true,
    });
  });

  it("never invents Online for missing or legacy unknown payment data", () => {
    expect(getStoredPaymentMethodPresentation(null, "en")).toEqual({
      label: "Not recorded",
      recognized: false,
      rawValue: null,
    });
    expect(getStoredPaymentMethodPresentation("Online", "en")).toEqual({
      label: "Unrecognized: Online",
      recognized: false,
      rawValue: "Online",
    });
  });
});

describe("payment status badge and detail formatting", () => {
  it("resolves paid when advance covers full total", async () => {
    const { resolvePaymentStatus } = await import("../src/lib/payment-status");
    expect(resolvePaymentStatus("partial", "pending", 10, 10)).toBe("paid");
    expect(resolvePaymentStatus("partially_paid", "pending", 25, 25)).toBe("paid");
  });

  it("resolves partial when advance is positive but less than total", async () => {
    const { resolvePaymentStatus, derivePaymentStatus } = await import("../src/lib/payment-status");
    expect(resolvePaymentStatus("partial", "pending", 25, 10)).toBe("partial");
    expect(resolvePaymentStatus("unpaid", "pending", 25, 10)).toBe("partial");
    expect(derivePaymentStatus("pending", 25, 10)).toBe("partial");
  });

  it("formats payment badge detail with correct remaining balance", async () => {
    const { formatPaymentBadgeDetail } = await import("../src/lib/payment-status");
    // 25 total, 10 advance -> due is 15
    const arDetail = formatPaymentBadgeDetail("partial", 25, 10, "BHD", "ar");
    expect(arDetail).toBe("مدفوع جزئياً (مدفوع 10.000 BHD / متبقي 15.000 BHD)");

    const enDetail = formatPaymentBadgeDetail("partial", 25, 10, "BHD", "en");
    expect(enDetail).toBe("Partially Paid (Paid BHD 10.000 / Due BHD 15.000)");
  });

  it("does not format remaining 0 when fully paid", async () => {
    const { formatPaymentBadgeDetail } = await import("../src/lib/payment-status");
    const arDetail = formatPaymentBadgeDetail("partial", 10, 10, "BHD", "ar");
    expect(arDetail).toBe("مدفوع");

    const enDetail = formatPaymentBadgeDetail("partial", 10, 10, "BHD", "en");
    expect(enDetail).toBe("Paid");
  });
});
