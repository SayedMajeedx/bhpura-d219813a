import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

// The home page is split across its route and src/features/storefront-home (Phase 5).
const homeSource = () =>
  [
    "src/routes/$slug.index.tsx",
    ...["components", "lib"].flatMap((dir) =>
      readdirSync(`src/features/storefront-home/${dir}`)
        .sort()
        .map((file) => `src/features/storefront-home/${dir}/${file}`),
    ),
  ]
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");

// The dashboard is split across its route and src/features/dashboard (Phase 5).
const dashboardSource = () =>
  [
    "src/routes/_authenticated/admin.b.$slug.dashboard.tsx",
    ...["components", "hooks", "lib"]
      .filter((dir) => existsSync(`src/features/dashboard/${dir}`))
      .flatMap((dir) =>
        readdirSync(`src/features/dashboard/${dir}`)
          .sort()
          .map((file) => `src/features/dashboard/${dir}/${file}`),
      ),
  ]
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");

// The checkout is split across its route and src/features/checkout (Phase 5).
const checkoutSource = () =>
  [
    "src/routes/$slug.checkout.tsx",
    ...["components", "hooks", "lib"].flatMap((dir) =>
      readdirSync(`src/features/checkout/${dir}`)
        .sort()
        .map((file) => `src/features/checkout/${dir}/${file}`),
    ),
  ]
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");

describe("storefront quality upgrades", () => {
  it("keeps admin-only chart and PDF libraries out of forced shared chunks", () => {
    const config = read("vite.config.ts");
    expect(config).not.toContain('return "vendor-pdf"');
    expect(config).not.toContain('return "vendor-charts"');
  });

  it("publishes product-specific social and canonical metadata", () => {
    const route = read("src/routes/$slug.product.$id.tsx");
    expect(route).toContain('property: "og:type", content: "product"');
    expect(route).toContain('name: "twitter:title", content: title');
    expect(route).toContain('rel: "canonical"');
  });

  it("prioritizes available inventory in storefront lists", () => {
    const home = homeSource();
    const category = read("src/routes/$slug.$category.tsx");
    expect(home).toContain("function availableFirst");
    expect(home).toContain("hasAvailableStock(b.product)");
    expect(home).toContain("Number(hasAvailableStock(b)) - Number(hasAvailableStock(a))");
    expect(category).toContain("Number(hasAvailableStock(b)) - Number(hasAvailableStock(a))");
  });

  it("makes email optional and requires explicit terms acceptance", () => {
    const checkout = checkoutSource();
    expect(checkout).toContain("customerEmail &&");
    expect(checkout).toContain("!acceptedTerms");
    expect(checkout).toContain('category: "terms-conditions"');
    expect(checkout).toContain('t("التوصيل المتوقع", "Estimated delivery")');
    expect(checkout).toContain('preset="thumb"');
  });

  it("alerts admins about available products without images", () => {
    const dashboard = dashboardSource();
    expect(dashboard).toContain("availableWithoutImages");
    expect(dashboard).toContain("منتجات متوفرة بلا صور");
  });
});
