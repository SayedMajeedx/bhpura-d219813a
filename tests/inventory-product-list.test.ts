import { describe, expect, it } from "vitest";
import {
  barcodeLabelsFor,
  duplicateProductValues,
  duplicateVariantValues,
  filterInventoryProducts,
  inventoryCategoryOptions,
  inventoryScopeFromFilter,
  productHasMedia,
  productStockFrom,
  productWeeklySalesFrom,
  salesByVariantFrom,
  variantsByProductFrom,
} from "../src/features/inventory/lib/product-list";
import type { Product, Variant } from "../src/features/inventory/types";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 24);

const product = (overrides: Partial<Product> = {}): Product =>
  ({
    id: "p1",
    name: "Abaya",
    name_ar: "عباية",
    name_en: "Abaya",
    description: null,
    description_ar: null,
    description_en: null,
    category: "abayas",
    image_url: "https://x/a.jpg",
    is_active: true,
    featured_trending: false,
    show_sale_badge: false,
    media: [],
    custom_fields: null,
    base_price: 30,
    ...overrides,
  }) as Product;

const variant = (overrides: Partial<Variant> = {}): Variant => ({
  id: "v1",
  product_id: "p1",
  sku: "AB-S",
  size: "S",
  color: "Black",
  fabric: null,
  cost_price: 10,
  selling_price: 30,
  original_price: null,
  stock: 5,
  stock_main: 3,
  stock_incubator: 2,
  barcode: "111",
  size_unit: null,
  image_url: null,
  ...overrides,
});

describe("stock and sales", () => {
  it("sums sold units per variant", () => {
    const sales = salesByVariantFrom([
      {
        order_items: [
          { variant_id: "v1", quantity: 2 },
          { variant_id: null, quantity: 9 },
        ],
      },
      { order_items: [{ variant_id: "v1", quantity: 1 }] },
      {},
    ]);
    expect(sales.get("v1")).toBe(3);
    expect(sales.size).toBe(1);
  });

  it("adds store and incubator stock across the product's variants", () => {
    const variants = [variant(), variant({ id: "v2", stock_main: 1, stock_incubator: 0 })];
    expect(productStockFrom(variants, "p1")).toBe(6);
    expect(productStockFrom(variants, "other")).toBe(0);
  });

  it("projects weekly sales from each variant's age, capped at 45 days", () => {
    const sales = new Map([
      ["new", 7],
      ["old", 45],
    ]);
    const variants = [
      variant({ id: "new", created_at: new Date(NOW - 7 * DAY).toISOString() }),
      variant({ id: "old", created_at: new Date(NOW - 300 * DAY).toISOString() }),
    ];
    // 7 sold over 7 days + 45 sold over the 45-day window = 2 a day.
    expect(productWeeklySalesFrom(variants, sales, "p1", NOW)).toBeCloseTo(14);
  });
});

describe("product media", () => {
  it("counts a cover image or any non-empty media item", () => {
    expect(productHasMedia(product())).toBe(true);
    expect(productHasMedia(product({ image_url: null }))).toBe(false);
    expect(
      productHasMedia(product({ image_url: null, media: [{ url: "https://x/b.jpg" }] as never })),
    ).toBe(true);
    expect(productHasMedia(product({ image_url: null, media: ["  "] as never }))).toBe(false);
  });
});

describe("inventoryScopeFromFilter", () => {
  it("maps dashboard links to scopes", () => {
    expect(inventoryScopeFromFilter("low_stock")).toBe("low");
    expect(inventoryScopeFromFilter("out")).toBe("out");
    expect(inventoryScopeFromFilter("hidden")).toBe("inactive");
    expect(inventoryScopeFromFilter("featured")).toBe("featured");
    expect(inventoryScopeFromFilter("nonsense")).toBeNull();
    expect(inventoryScopeFromFilter(undefined)).toBeNull();
  });
});

describe("filterInventoryProducts", () => {
  const products = [
    product({ id: "a", name: "Silk abaya", base_price: 50, category: "abayas" }),
    product({ id: "b", name: "Scarf", base_price: 10, category: "scarves", is_active: false }),
    product({ id: "c", name: "Kaftan", base_price: 30, featured_trending: true, image_url: null }),
  ];
  const variants = [
    variant({ id: "va", product_id: "a", sku: "SLK-1", stock_main: 0, stock_incubator: 0 }),
    variant({ id: "vb", product_id: "b", sku: "SCF-1", stock_main: 20 }),
    variant({ id: "vc", product_id: "c", sku: "KFT-1" }),
  ];
  const run = (overrides: Partial<Parameters<typeof filterInventoryProducts>[0]>) =>
    filterInventoryProducts({
      products,
      variantsByProduct: variantsByProductFrom(variants),
      search: "",
      category: "all",
      scope: "all",
      sortBy: "newest",
      productStock: (id) => productStockFrom(variants, id),
      productWeeklySales: () => 0,
      ...overrides,
    }).map((p) => p.id);

  it("searches names and variant SKUs", () => {
    expect(run({ search: "scarf" })).toEqual(["b"]);
    expect(run({ search: "kft-1" })).toEqual(["c"]);
  });

  it("filters by category and scope", () => {
    expect(run({ category: "abayas" })).toEqual(["a", "c"]);
    expect(run({ scope: "inactive" })).toEqual(["b"]);
    expect(run({ scope: "out" })).toEqual(["a"]);
    expect(run({ scope: "featured" })).toEqual(["c"]);
    expect(run({ scope: "attention" })).toEqual(["a", "c"]);
  });

  it("sorts by price or stock and keeps the loaded order for newest", () => {
    expect(run({})).toEqual(["a", "b", "c"]);
    expect(run({ sortBy: "price-asc" })).toEqual(["b", "c", "a"]);
    expect(run({ sortBy: "price-desc" })).toEqual(["a", "c", "b"]);
    expect(run({ sortBy: "stock-asc" })[0]).toBe("a");
  });
});

describe("inventoryCategoryOptions", () => {
  it("lists used categories, named from the category table by slug or name", () => {
    const options = inventoryCategoryOptions(
      [
        product({ category: "abayas" }),
        product({ category: "Unknown" }),
        product({ category: null }),
      ],
      [{ id: "1", name_en: "Abayas", name_ar: "عبايات", slug: "ABAYAS" }],
    );
    expect(options).toEqual([
      { id: "abayas", name: "Abayas", name_ar: "عبايات" },
      { id: "Unknown", name: "Unknown", name_ar: "Unknown" },
    ]);
  });
});

describe("barcodeLabelsFor", () => {
  it("makes one label per variant with a barcode", () => {
    const labels = barcodeLabelsFor(
      [product()],
      [variant(), variant({ id: "v2", barcode: null }), variant({ product_id: "other" })],
      "Pura",
    );
    expect(labels).toEqual([
      {
        code: "111",
        productName: "Abaya",
        size: "S",
        color: "Black",
        price: 30,
        businessName: "Pura",
      },
    ]);
  });
});

describe("duplication", () => {
  it("copies the product as a hidden draft with suffixed names", () => {
    const values = duplicateProductValues(product(), "brand-1", true);
    expect(values).toMatchObject({
      brand_id: "brand-1",
      name: "Abaya (نسخة)",
      name_ar: "عباية (نسخة)",
      name_en: "Abaya (Copy)",
      is_active: false,
    });
  });

  it("copies variants with new SKUs, no barcode and no incubator stock", () => {
    const [copy] = duplicateVariantValues([variant()], "p2", "brand-1", () => 0.5);
    expect(copy).toMatchObject({
      product_id: "p2",
      sku: "AB-S-COPY-500",
      barcode: null,
      stock_main: 3,
      stock_incubator: 0,
    });
  });
});
