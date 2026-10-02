import { describe, expect, it } from "vitest";
import migration from "../supabase/migrations/20261002180000_storefront_page_data_packages.sql?raw";
import { PRODUCT_CARD_SELECT } from "../src/lib/data/storefront/selects";

// get_storefront_page_data lists the home page's products with "the same columns
// as PRODUCT_CARD_SELECT". It once left out is_package and extra_hour_price, so a
// services store's home page could not tell a package from a service.

describe("the storefront page data's products", () => {
  it("say whether a product is a package and what an extra hour costs", () => {
    expect(migration).toContain("'is_package', p.is_package");
    expect(migration).toContain("'extra_hour_price', p.extra_hour_price");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.get_storefront_page_data(text)");
  });

  it("carry every column the services home page reads from the product card select", () => {
    for (const column of [
      "item_kind",
      "is_package",
      "extra_hour_price",
      "service_includes",
      "service_location",
      "category",
      "media",
    ]) {
      expect(PRODUCT_CARD_SELECT, column).toContain(column);
      expect(migration, column).toContain(`'${column}', p.${column}`);
    }
  });
});
