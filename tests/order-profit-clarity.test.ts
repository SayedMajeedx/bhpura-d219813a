import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("order profit clarity", () => {
  it("labels unpaid order profit as expected rather than realized", () => {
    const detail = readFileSync(
      "src/routes/_authenticated/admin.b.$slug.orders.$id.tsx",
      "utf8",
    );
    const quickView = readFileSync("src/components/orders/OrderQuickViewModal.tsx", "utf8");

    for (const source of [detail, quickView]) {
      expect(source).toContain("الربح الإجمالي المتوقع بعد التحصيل الكامل");
      expect(source).toContain("Estimated gross profit after full collection");
      expect(source).not.toContain("Order Net Gross Profit");
    }
  });
});
