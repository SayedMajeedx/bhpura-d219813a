import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("order profit clarity", () => {
  it("labels unpaid order profit as expected rather than realized", () => {
    // The order totals card moved to src/features/orders/components (Phase 5).
    const detail = readFileSync("src/features/orders/components/OrderFinancialCard.tsx", "utf8");
    const quickView = readFileSync("src/components/orders/OrderQuickViewModal.tsx", "utf8");

    for (const source of [detail, quickView]) {
      expect(source).toContain("الربح الإجمالي المتوقع بعد التحصيل الكامل");
      expect(source).toContain("Estimated gross profit after full collection");
      expect(source).not.toContain("Order Net Gross Profit");
    }
  });
});
