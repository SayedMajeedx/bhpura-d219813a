import { describe, expect, it } from "vitest";
import {
  getAdminNavItems,
  MERCHANT_JOB_GROUPS,
  type MerchantJobCategory,
} from "../src/config/admin-navigation";

describe("Admin Navigation Architecture & Merchant Job Categories", () => {
  const mockOptions = {
    activeSlug: "boutq-test",
    isCourier: false,
    isAdmin: true,
    hasPermission: () => true,
    t: (key: string) => key,
    lang: "ar" as const,
  };

  it("exports all 5 merchant job groups with both Arabic and English labels", () => {
    expect(MERCHANT_JOB_GROUPS.length).toBe(5);
    const groupIds = MERCHANT_JOB_GROUPS.map((g) => g.id);
    expect(groupIds).toEqual([
      "today",
      "products_stock",
      "customers_growth",
      "money_reports",
      "store_setup",
    ]);

    for (const group of MERCHANT_JOB_GROUPS) {
      expect(group.labelAr).toBeTruthy();
      expect(group.labelEn).toBeTruthy();
      expect(group.shortLabelAr).toBeTruthy();
      expect(group.shortLabelEn).toBeTruthy();
    }
  });

  it("assigns every navigation item to one of the 5 merchant categories", () => {
    const items = getAdminNavItems(mockOptions);
    const validCategories: MerchantJobCategory[] = [
      "today",
      "products_stock",
      "customers_growth",
      "money_reports",
      "store_setup",
    ];

    expect(items.length).toBeGreaterThanOrEqual(18);

    for (const item of items) {
      expect(validCategories).toContain(item.category);
    }
  });

  it("correctly groups core features into expected merchant jobs", () => {
    const items = getAdminNavItems(mockOptions);
    const itemMap = new Map(items.map((i) => [i.id, i]));

    expect(itemMap.get("dashboard")?.category).toBe("today");
    expect(itemMap.get("inventory")?.category).toBe("products_stock");
    expect(itemMap.get("categories")?.category).toBe("products_stock");
    expect(itemMap.get("customers")?.category).toBe("customers_growth");
    expect(itemMap.get("discounts")?.category).toBe("customers_growth");
    expect(itemMap.get("orders")?.category).toBe("money_reports");
    expect(itemMap.get("reports")?.category).toBe("money_reports");
    expect(itemMap.get("returns")?.category).toBe("money_reports");
    expect(itemMap.get("expenses")?.category).toBe("money_reports");
    expect(itemMap.get("settings")?.category).toBe("store_setup");
    expect(itemMap.get("team")?.category).toBe("store_setup");
  });
});
