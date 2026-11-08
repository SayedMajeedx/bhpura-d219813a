import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRODUCT_MAPPINGS,
  buildProductImportPayload,
  priceFromCell,
  stockFromCell,
} from "../src/features/inventory/lib/product-import";

// Bug #51: the product import made up what a file did not say. A row with no price was sold at
// 10 (and a price of 0 became 10), a row with no stock got 10 pieces the opening ledger then
// recorded as real stock, every product got "Imported product details" as its description, and
// a Shopify row that only adds a photo became a variant of its own at 10 with 10 pieces.

const sku = () => "GEN";
const custom = (
  rows: string[][],
  headers: string[],
  mappings: Record<string, number>,
  pricesMatter = true,
) =>
  buildProductImportPayload({
    rows,
    headers,
    preset: "custom",
    mappings: { ...DEFAULT_PRODUCT_MAPPINGS, ...mappings },
    isAr: false,
    makeSku: sku,
    pricesMatter,
  });

describe("a file with no price and no stock columns", () => {
  const { products, invalidCount, unpricedCount } = custom(
    [["Black Abaya"], ["Navy Abaya"]],
    ["Name"],
    { name: 0 },
  );

  it("brings every product in, hidden until it is priced", () => {
    expect(invalidCount).toBe(0);
    expect(unpricedCount).toBe(2);
    expect(products.map((p) => [p.name, p.is_active])).toEqual([
      ["Black Abaya", false],
      ["Navy Abaya", false],
    ]);
  });

  it("makes up no price, no stock and no description", () => {
    for (const product of products) {
      expect(product.variants).toHaveLength(1);
      expect(product.variants[0]).toMatchObject({ selling_price: 0, stock_main: 0 });
      expect(product.description).toBeNull();
      expect(product.description_ar).toBeNull();
      expect(product.description_en).toBeNull();
    }
  });

  it("is the same in every platform's preset", () => {
    for (const [preset, headers] of [
      ["shopify", ["Handle", "Title"]],
      ["woocommerce", ["Name"]],
      ["salla", ["اسم المنتج"]],
    ] as const) {
      const row = preset === "shopify" ? ["abaya", "Abaya"] : ["Abaya"];
      const result = buildProductImportPayload({
        rows: [row],
        headers: [...headers],
        preset,
        mappings: DEFAULT_PRODUCT_MAPPINGS,
        isAr: false,
        makeSku: sku,
      });
      expect(result.products[0]?.variants[0], preset).toMatchObject({
        selling_price: 0,
        stock_main: 0,
      });
      expect(result.products[0]?.is_active, preset).toBe(false);
      expect(result.products[0]?.description, preset).toBeNull();
    }
  });
});

describe("what a file does say", () => {
  it("keeps a price of 0 and a stock of 0 as written, and shows the product", () => {
    const { products, unpricedCount } = custom(
      [["Gift wrap", "0", "0"]],
      ["Name", "Price", "Stock"],
      { name: 0, price: 1, stock: 2 },
    );
    expect(products[0].variants[0]).toMatchObject({ selling_price: 0, stock_main: 0 });
    expect(products[0].is_active).toBe(true);
    expect(unpricedCount).toBe(0);
  });

  it("hides only the product whose price cell is empty", () => {
    const { products, unpricedCount } = custom(
      [
        ["Shawl", "8.500", ""],
        ["Scarf", "", "4"],
      ],
      ["Name", "Price", "Stock"],
      { name: 0, price: 1, stock: 2 },
    );
    expect(products.map((p) => [p.name, p.is_active, p.variants[0].stock_main])).toEqual([
      ["Shawl", true, 0],
      ["Scarf", false, 4],
    ]);
    expect(unpricedCount).toBe(1);
  });

  it("reads Arabic digits and the Arabic decimal mark", () => {
    expect(priceFromCell("٢٥٫٥٠٠ د.ب")).toBe(25.5);
    expect(priceFromCell("BHD 12.000")).toBe(12);
    expect(priceFromCell("")).toBeNull();
    expect(priceFromCell("call us")).toBeNull();
    expect(stockFromCell("٣ قطع")).toBe(3);
    expect(stockFromCell("")).toBe(0);
    expect(stockFromCell(undefined)).toBe(0);
  });

  it("takes the SKU from its column in a custom file", () => {
    const { products } = custom([["Shawl", "8", "SH-01 "]], ["Name", "Price", "SKU"], {
      name: 0,
      price: 1,
      sku: 2,
    });
    expect(products[0].variants[0].sku).toBe("SH-01");
  });
});

describe("a catalog that shows no prices", () => {
  it("brings a product with no price in as it is: no price is as meant there", () => {
    const { products, unpricedCount } = custom([["Abaya"]], ["Name"], { name: 0 }, false);
    expect(products[0].is_active).toBe(true);
    expect(products[0].variants[0].selling_price).toBe(0);
    expect(unpricedCount).toBe(0);
  });
});

describe("a Shopify export", () => {
  const headers = [
    "Handle",
    "Title",
    "Option1 Name",
    "Option1 Value",
    "Variant SKU",
    "Variant Price",
    "Variant Inventory Qty",
    "Image Src",
  ];
  const shopify = (rows: string[][]) =>
    buildProductImportPayload({
      rows,
      headers,
      preset: "shopify",
      mappings: DEFAULT_PRODUCT_MAPPINGS,
      isAr: false,
      makeSku: sku,
    });

  it("takes a row that only adds a photo as a photo, never as a variant", () => {
    const { products } = shopify([
      ["abaya", "Abaya", "Size", "54", "AB-54", "30", "2", "https://img/1.jpg"],
      ["abaya", "", "", "", "", "", "", "https://img/2.jpg"],
      ["abaya", "", "", "", "", "", "", "https://img/3.jpg"],
    ]);
    expect(products).toHaveLength(1);
    expect(products[0].variants.map((v) => [v.sku, v.size, v.selling_price, v.stock_main])).toEqual(
      [["AB-54", "54", 30, 2]],
    );
    expect(products[0].is_active).toBe(true);
  });

  it("drops a photo row that came first once a real variant follows", () => {
    const { products } = shopify([
      ["abaya", "Abaya", "", "", "", "", "", "https://img/1.jpg"],
      ["abaya", "", "Size", "56", "AB-56", "32", "1", ""],
    ]);
    expect(products[0].variants.map((v) => v.sku)).toEqual(["AB-56"]);
    expect(products[0].is_active).toBe(true);
    expect(products[0].image_url).toBe("https://img/1.jpg");
  });

  it("hides a product while one of its sizes has no price", () => {
    const { products, unpricedCount } = shopify([
      ["abaya", "Abaya", "Size", "54", "AB-54", "30", "2", ""],
      ["abaya", "", "Size", "56", "AB-56", "", "1", ""],
    ]);
    expect(products[0].variants.map((v) => [v.sku, v.selling_price])).toEqual([
      ["AB-54", 30],
      ["AB-56", 0],
    ]);
    expect(products[0].is_active).toBe(false);
    expect(unpricedCount).toBe(1);
  });
});
