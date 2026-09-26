import { describe, expect, it } from "vitest";
import { productHead } from "../src/features/product-page/lib/product-head";
import { sortCatalogProducts } from "../src/lib/catalog-sort";
import type { ProductRow } from "../src/lib/data/storefront";

// The rest of the upgrades are covered where they live: in-stock first on the
// home page (tests/home-products.test.ts), optional email and required terms at
// checkout (tests/checkout-lib.test.ts), products without images on the
// dashboard (tests/dashboard-metrics.test.ts), and the admin-only chunks rule
// (tests/storefront-performance-guardrails.test.ts).

const product = (id: string, overrides: Partial<ProductRow> & { stock?: number } = {}) => {
  const { stock = 3, ...rest } = overrides;
  return {
    id,
    created_at: "2026-09-01T00:00:00Z",
    product_variants: [{ id: `${id}-v`, selling_price: 10, stock_main: stock, stock_incubator: 0 }],
    ...rest,
  } as unknown as ProductRow;
};

describe("storefront quality upgrades", () => {
  it("publishes product-specific social and canonical metadata", () => {
    const head = productHead({
      loaderData: {
        initialLang: "en",
        brand: { slug: "pura" },
        product: {
          id: "p1",
          name_en: "Silk Abaya",
          description_en: "Soft   silk\\nabaya",
          image_url: "https://media.boutq.store/p1.jpg",
          base_price: 30,
        },
      },
      params: { slug: "pura", id: "p1" },
    });
    expect(head.meta).toEqual(
      expect.arrayContaining([
        { title: "Silk Abaya | PURA" },
        { property: "og:type", content: "product" },
        { property: "og:image", content: "https://media.boutq.store/p1.jpg" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: "Silk Abaya | PURA" },
      ]),
    );
    expect(head.links).toEqual([{ rel: "canonical", href: "https://boutq.store/pura/product/p1" }]);
    expect(head.htmlAttrs).toEqual({ lang: "en", dir: "ltr" });
    expect(productHead({ loaderData: {}, params: { slug: "pura", id: "p1" } })).toEqual({});
  });

  it("prioritizes available inventory in category lists, then the chosen sort", () => {
    const rows = [
      product("sold-out-new", { stock: 0, created_at: "2026-09-20T00:00:00Z" }),
      product("old", { created_at: "2026-01-01T00:00:00Z" }),
      product("new", { created_at: "2026-09-10T00:00:00Z" }),
    ];
    const ids = (sorted: ProductRow[]) => sorted.map((row) => row.id);
    expect(ids(sortCatalogProducts(rows, "new"))).toEqual(["new", "old", "sold-out-new"]);
    expect(ids(sortCatalogProducts(rows, "old"))).toEqual(["old", "new", "sold-out-new"]);

    const cheap = product("cheap", {
      product_variants: [{ selling_price: 5, stock_main: 1 }],
    } as Partial<ProductRow>);
    expect(ids(sortCatalogProducts([rows[2], cheap], "price-low"))).toEqual(["cheap", "new"]);
    expect(ids(sortCatalogProducts([cheap, rows[2]], "price-high"))).toEqual(["new", "cheap"]);
    // The input is not reordered in place.
    expect(ids(rows)).toEqual(["sold-out-new", "old", "new"]);
  });
});
