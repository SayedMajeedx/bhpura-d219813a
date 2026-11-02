import { describe, expect, it } from "vitest";
import {
  becameMessage,
  becomePatch,
  firstSizes,
  leftoverMessage,
  piecesQuestion,
} from "../src/features/inventory/lib/first-sizes";
import { newProductVariants, productFormFrom } from "../src/features/inventory/lib/product-form";
import { newVariantDraft } from "../src/features/inventory/lib/variant-draft";
import { toggledSize, usualSizes, withSize } from "../src/lib/size-choices";
import type { Variant } from "../src/features/inventory/types";

// Adding sizes to a product sold so far with no options: its default variant is never left
// beside them, where it read as a size of its own (src/features/inventory/lib/first-sizes.ts).

const variant = (overrides: Partial<Variant>) =>
  ({
    id: "v",
    product_id: "p",
    size: null,
    color: null,
    fabric: null,
    stock_main: 0,
    stock_incubator: 0,
    selling_price: 30,
    ...overrides,
  }) as unknown as Variant;

describe("what adding sizes does", () => {
  it("turns a default holding pieces into the size, keeping them", () => {
    expect(firstSizes([variant({ id: "d", stock_main: 3 })])).toEqual({
      kind: "become",
      defaultId: "d",
      pieces: 3,
    });
    // Pieces at a partner count: they move with the variant.
    expect(firstSizes([variant({ id: "d", stock_incubator: 2 })])).toMatchObject({
      kind: "become",
      pieces: 2,
    });
    // The word an older default kept in its size is still the default.
    expect(firstSizes([variant({ id: "d", size: "قياسي", stock_main: 1 })]).kind).toBe("become");
  });

  it("replaces a default with no pieces", () => {
    expect(firstSizes([variant({ id: "d" })])).toEqual({ kind: "replace", defaultId: "d" });
  });

  it("just adds to a product that already has sizes", () => {
    expect(firstSizes([variant({ size: "52" })])).toEqual({ kind: "add" });
    expect(firstSizes([variant({ id: "a" }), variant({ id: "b", size: "54" })])).toEqual({
      kind: "add",
    });
    expect(firstSizes([])).toEqual({ kind: "add" });
  });

  it("gives the default the size's options, codes and prices, never its stock or cost", () => {
    const patch = becomePatch({
      size: "52",
      size_unit: null,
      color: "أسود",
      fabric: null,
      option_four: null,
      option_five: null,
      sku: "AB-52",
      barcode: "2900000000001",
      selling_price: 30,
      original_price: null,
      cost_price: 9,
      stock_main: 0,
      stock_incubator: 0,
      stock: 0,
    });
    expect(patch).toEqual({
      size: "52",
      size_unit: null,
      color: "أسود",
      fabric: null,
      option_four: null,
      option_five: null,
      sku: "AB-52",
      barcode: "2900000000001",
      selling_price: 30,
      original_price: null,
    });
  });

  it("speaks the reader's language, the count last in Arabic", () => {
    expect(becameMessage(3, "52", false)).toBe("Your 3 pieces in stock are now 52.");
    expect(becameMessage(1, "52", true)).toBe(
      "القطع الموجودة أصبحت من هذا الخيار: 52 (قطعة واحدة).",
    );
    expect(piecesQuestion(2, false)).toBe(
      "You have 2 pieces in stock with no options. Which size are they?",
    );
    expect(leftoverMessage(true)).toMatch(/بدون خيارات/);
  });

  it("starts the add row with the pieces the default has, when it will become that size", () => {
    expect(newVariantDraft(undefined, [variant({ stock_main: 4 })]).stock_main).toBe("4");
    expect(newVariantDraft(undefined, [variant({ size: "52", stock_main: 4 })]).stock_main).toBe(
      newVariantDraft(undefined, []).stock_main,
    );
  });
});

describe("a new product's sizes before its first save", () => {
  const form = { ...productFormFrom(null), name_ar: "عباية", base_price: "30", initial_stock: "5" };

  it("makes exactly the sizes chosen, each with its own pieces", () => {
    const rows = newProductVariants({ ...form, sizes: ["52", "54"], size_stock: { "54": "2" } });
    expect(rows.map((row) => [row.size, row.stock_main, row.selling_price])).toEqual([
      ["52", 0, 30],
      ["54", 2, 30],
    ]);
  });

  it("is sold with no options when none is chosen, with its opening pieces", () => {
    expect(newProductVariants(form)).toEqual([
      expect.objectContaining({ size: null, color: null, stock_main: 5 }),
    ]);
  });

  it("offers the store's usual sizes and takes one typed by hand once", () => {
    expect(usualSizes([{ size: "52" }, { size: "قياسي" }, { size: "54" }, { size: "52" }])).toEqual(
      ["52", "54"],
    );
    expect(withSize(["52"], " xl ")).toEqual(["52", "xl"]);
    expect(withSize(["XL"], "xl")).toEqual(["XL"]);
    expect(toggledSize(["52", "54"], "52")).toEqual(["54"]);
    expect(toggledSize(["54"], "52")).toEqual(["54", "52"]);
  });
});
