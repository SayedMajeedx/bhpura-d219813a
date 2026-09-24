import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRODUCT_MAPPINGS,
  buildProductImportPayload,
  detectProductColumns,
  mergeImportRunsBySession,
} from "../src/features/inventory/lib/product-import";
import { SIZE_UNITS, SIZE_UNIT_LABELS } from "../src/features/inventory/lib/size-units";

describe("detectProductColumns", () => {
  it("maps a Shopify export", () => {
    expect(
      detectProductColumns([
        "Handle",
        "Title",
        "Variant Price",
        "Image Src",
        "Variant Inventory Qty",
      ]),
    ).toEqual({ name: 1, price: 2, image: 3, stock: 4 });
  });

  it("maps Arabic headers", () => {
    expect(detectProductColumns(["اسم المنتج", "السعر", "صورة المنتج", "الكمية"])).toEqual({
      name: 0,
      price: 1,
      image: 2,
      stock: 3,
    });
  });

  it("leaves unknown fields unmapped", () => {
    expect(detectProductColumns(["SKU", "Weight"])).toEqual(DEFAULT_PRODUCT_MAPPINGS);
  });

  it("matches headers that contain an alias (known quirk: 'Cost price' maps to price)", () => {
    expect(detectProductColumns(["Price (BHD)"]).price).toBe(0);
    expect(detectProductColumns(["Cost price", "Price"]).price).toBe(0);
  });
});

describe("mergeImportRunsBySession", () => {
  const run = (session_id: string, status: string, counts: [number, number, number, number]) => ({
    session_id,
    status,
    total_count: counts[0],
    success_count: counts[1],
    skipped_count: counts[2],
    failed_count: counts[3],
  });

  it("sums batches of one session and keeps the worst status", () => {
    const merged = mergeImportRunsBySession(
      [run("s1", "completed", [10, 10, 0, 0]), run("s1", "partial", [5, 3, 1, 1])],
      5,
    );
    expect(merged).toEqual([run("s1", "partial", [15, 13, 1, 1])]);
  });

  it("keeps sessions newest-first and applies the limit", () => {
    const merged = mergeImportRunsBySession(
      [
        run("new", "completed", [1, 1, 0, 0]),
        run("mid", "completed", [1, 1, 0, 0]),
        run("old", "completed", [1, 1, 0, 0]),
      ],
      2,
    );
    expect(merged.map((r) => r.session_id)).toEqual(["new", "mid"]);
  });

  it("does not mutate the input rows", () => {
    const rows = [run("s1", "completed", [1, 1, 0, 0]), run("s1", "completed", [2, 2, 0, 0])];
    mergeImportRunsBySession(rows, 5);
    expect(rows[0].total_count).toBe(1);
  });
});

describe("size units", () => {
  it("has a bilingual label for every selectable unit", () => {
    for (const unit of SIZE_UNITS) {
      expect(SIZE_UNIT_LABELS[unit]?.ar, unit).toBeTruthy();
      expect(SIZE_UNIT_LABELS[unit]?.en, unit).toBeTruthy();
    }
  });
});

describe("buildProductImportPayload", () => {
  const sku = () => "GEN";

  it("merges Shopify variant rows by Handle and reads size/colour options", () => {
    const headers = [
      "Handle",
      "Title",
      "Option1 Name",
      "Option1 Value",
      "Option2 Name",
      "Option2 Value",
      "Variant SKU",
      "Variant Price",
      "Variant Inventory Qty",
      "Image Src",
    ];
    const rows = [
      [
        "black-abaya",
        "Black Abaya",
        "Size",
        "M",
        "Color",
        "Black",
        "BA-M",
        "25.500",
        "3",
        "https://img/1.jpg",
      ],
      ["black-abaya", "", "Size", "L", "Color", "Black", "BA-L", "25.500", "0", ""],
    ];
    const { products, invalidCount } = buildProductImportPayload({
      rows,
      headers,
      preset: "shopify",
      mappings: DEFAULT_PRODUCT_MAPPINGS,
      isAr: false,
      makeSku: sku,
    });
    expect(invalidCount).toBe(0);
    expect(products).toHaveLength(1);
    expect(products[0].name).toBe("Black Abaya");
    expect(products[0].image_url).toBe("https://img/1.jpg");
    expect(
      products[0].variants.map((v) => [v.sku, v.size, v.color, v.selling_price, v.stock_main]),
    ).toEqual([
      ["BA-M", "M", "Black", 25.5, 3],
      ["BA-L", "L", "Black", 25.5, 0],
    ]);
  });

  it("reads Salla/Zid Arabic columns and keeps the first image", () => {
    const { products } = buildProductImportPayload({
      rows: [["عباية كحلي", "30", "https://a.jpg, https://b.jpg", "5", "AB-1"]],
      headers: ["اسم المنتج", "السعر", "صورة المنتج", "الكمية", "رمز المنتج"],
      preset: "salla",
      mappings: DEFAULT_PRODUCT_MAPPINGS,
      isAr: true,
      makeSku: sku,
    });
    expect(products[0]).toMatchObject({
      name: "عباية كحلي",
      name_ar: "عباية كحلي",
      name_en: null,
      image_url: "https://a.jpg",
    });
    expect(products[0].variants[0]).toMatchObject({
      sku: "AB-1",
      selling_price: 30,
      stock_main: 5,
    });
  });

  it("uses confirmed mappings for a custom file and generates missing SKUs", () => {
    const { products } = buildProductImportPayload({
      rows: [["12.5", "Scarf"]],
      headers: ["Cost", "Item"],
      preset: "custom",
      mappings: { name: 1, price: 0, image: -1, stock: -1 },
      isAr: false,
      makeSku: sku,
    });
    expect(products[0].name).toBe("Scarf");
    expect(products[0].variants[0]).toMatchObject({ sku: "GEN", selling_price: 12.5 });
  });

  it("drops rows without a name and counts them", () => {
    const { products, invalidCount } = buildProductImportPayload({
      rows: [
        ["", "10"],
        ["Shawl", "8"],
      ],
      headers: ["Name", "Price"],
      preset: "custom",
      mappings: { name: 0, price: 1, image: -1, stock: -1 },
      isAr: false,
      makeSku: sku,
    });
    expect(products.map((p) => p.name)).toEqual(["Shawl"]);
    expect(invalidCount).toBe(1);
  });
});
