import { describe, expect, it } from "vitest";
import { grossProfitLabel } from "../src/lib/order-profit-label";

describe("order profit clarity", () => {
  it("labels profit as expected after collection while the customer still owes money", () => {
    expect(grossProfitLabel(12.5, "en")).toBe("Estimated gross profit after full collection:");
    expect(grossProfitLabel(12.5, "ar")).toBe("الربح الإجمالي المتوقع بعد التحصيل الكامل:");
  });

  it("labels fully paid orders' profit as the plain estimate", () => {
    expect(grossProfitLabel(0, "en")).toBe("Estimated gross profit:");
    expect(grossProfitLabel(0, "ar")).toBe("الربح الإجمالي التقديري:");
  });

  it("never calls unpaid profit net or realized", () => {
    for (const remaining of [0, 5]) {
      expect(grossProfitLabel(remaining, "en")).not.toMatch(/net|realized/i);
    }
  });
});
