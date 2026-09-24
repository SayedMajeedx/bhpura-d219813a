import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRODUCT_MAPPINGS,
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
