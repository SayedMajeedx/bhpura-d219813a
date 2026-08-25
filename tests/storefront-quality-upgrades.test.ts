import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("storefront quality upgrades", () => {
  it("keeps admin-only chart and PDF libraries out of forced shared chunks", () => {
    const config = read("vite.config.ts");
    expect(config).not.toContain('return "vendor-pdf"');
    expect(config).not.toContain('return "vendor-charts"');
  });

  it("publishes product-specific social and canonical metadata", () => {
    const route = read("src/routes/$slug.product.$id.tsx");
    const queries = read("src/lib/storefront-queries.ts");
    expect(route).toContain('property: "og:type", content: "product"');
    expect(route).toContain('name: "twitter:title", content: title');
    expect(route).toContain('rel: "canonical"');
    expect(queries).toContain("if (error)");
    expect(queries).toContain("publicFields");
  });

  it("prioritizes available inventory in storefront lists", () => {
    const home = read("src/routes/$slug.index.tsx");
    const category = read("src/routes/$slug.$category.tsx");
    expect(home).toContain("function availableFirst");
    expect(home).toContain("hasAvailableStock(b.product)");
    expect(home).toContain("Number(hasAvailableStock(b)) - Number(hasAvailableStock(a))");
    expect(category).toContain("Number(hasAvailableStock(b)) - Number(hasAvailableStock(a))");
  });

  it("makes email optional and requires explicit terms acceptance", () => {
    const checkout = read("src/routes/$slug.checkout.tsx");
    expect(checkout).toContain("customerEmail &&");
    expect(checkout).toContain("!acceptedTerms");
    expect(checkout).toContain('category: "terms-conditions"');
    expect(checkout).toContain('t("التوصيل المتوقع", "Estimated delivery")');
    expect(checkout).toContain('preset="thumb"');
  });

  it("alerts admins about available products without images", () => {
    const dashboard = read("src/routes/_authenticated/admin.b.$slug.dashboard.tsx");
    expect(dashboard).toContain("availableWithoutImages");
    expect(dashboard).toContain("منتجات متوفرة بلا صور");
  });
});
