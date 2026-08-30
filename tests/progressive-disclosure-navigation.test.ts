import { describe, expect, it } from "vitest";
import {
  getAdminNavItems,
  CORE_NAV_IDS,
  DEFAULT_PINNED_IDS,
} from "../src/config/admin-navigation";

describe("Progressive Disclosure & Modular Navigation", () => {
  const mockOptions = {
    activeSlug: "my-boutique",
    isCourier: false,
    isAdmin: true,
    hasPermission: () => true,
    t: (key: string) => key,
    lang: "ar" as const,
  };

  it("exports CORE_NAV_IDS matching the 6 foundational daily modules", () => {
    expect(CORE_NAV_IDS).toEqual([
      "dashboard",
      "orders",
      "inventory",
      "customers",
      "reports",
      "settings",
    ]);
  });

  it("exports DEFAULT_PINNED_IDS with sensible defaults", () => {
    expect(DEFAULT_PINNED_IDS).toContain("returns");
    expect(DEFAULT_PINNED_IDS).toContain("discounts");
    expect(DEFAULT_PINNED_IDS).toContain("campaigns");
  });

  it("properly tags items with core vs modular tiers", () => {
    const items = getAdminNavItems(mockOptions);

    const coreItems = items.filter((i) => i.tier === "core");
    const modularItems = items.filter((i) => i.tier === "modular");

    expect(coreItems.map((i) => i.id)).toEqual([
      "dashboard",
      "reports",
      "orders",
      "customers",
      "inventory",
      "settings",
    ]);

    expect(modularItems.map((i) => i.id)).toEqual([
      "returns",
      "reviews",
      "incubators",
      "categories",
      "campaigns",
      "discounts",
      "loyalty",
      "abandoned-carts",
      "expenses",
      "integrations",
      "communications",
      "pages",
      "team",
    ]);
  });

  it("handles courier mode cleanly without rendering modular items", () => {
    const items = getAdminNavItems({
      ...mockOptions,
      isCourier: true,
    });

    expect(items.length).toBe(1);
    expect(items[0].id).toBe("orders");
  });

  it("returns empty navigation when no active slug is present", () => {
    const items = getAdminNavItems({
      ...mockOptions,
      activeSlug: null,
    });

    expect(items).toEqual([]);
  });
});
