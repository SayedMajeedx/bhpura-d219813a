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
