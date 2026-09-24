import { describe, expect, it } from "vitest";
import {
  emptyVariantDraft,
  isBarcodeInUse,
  makeInStoreBarcode,
  newVariantDraft,
  newVariantValues,
  normalizeBarcode,
  variantColumnPatch,
} from "../src/features/inventory/lib/variant-draft";
import type { Product, Variant } from "../src/features/inventory/types";

const product = { base_price: 30, cost_price: 12 } as Product;

const variant = (overrides: Partial<Variant> = {}): Variant => ({
  id: "v1",
  product_id: "p1",
  sku: "A-S",
  size: "S",
  color: "Black",
  fabric: "Silk",
  option_four: null,
  option_five: null,
  cost_price: 10,
  selling_price: 25,
  original_price: 30,
  stock: 4,
  stock_main: 3,
  stock_incubator: 1,
  barcode: "2900000000001",
  size_unit: "cm",
  image_url: null,
  ...overrides,
});

const allVisible = { size: true, color: true, fabric: true, four: true, five: true };

describe("newVariantDraft", () => {
  it("duplicates a variant without its colour", () => {
    const draft = newVariantDraft(product, [], variant());
    expect(draft).toMatchObject({
      size: "S",
      size_unit: "cm",
      color: "",
      fabric: "Silk",
      cost_price: "10",
      selling_price: "25",
      original_price: "30",
      stock_main: "3",
      stock_incubator: "1",
      sku: "",
      barcode: "",
    });
  });

  it("prefills size, unit and price from existing variants", () => {
    const draft = newVariantDraft(product, [variant({ size: null }), variant({ size: "M" })]);
    expect(draft).toMatchObject({
      size: "M",
      size_unit: "cm",
      selling_price: "25",
      cost_price: "12",
      original_price: "30",
      stock_main: "0",
    });
  });

  it("starts empty for the first variant", () => {
    expect(emptyVariantDraft(product)).toMatchObject({ cost_price: "12", selling_price: "" });
  });
});

describe("barcodes", () => {
  it("generates a valid in-store EAN-13", () => {
    const code = makeInStoreBarcode();
    expect(code).toMatch(/^29\d{11}$/);
    const digits = code.split("").map(Number);
    const sum = digits.slice(0, 12).reduce((s, d, i) => s + d * (i % 2 === 0 ? 1 : 3), 0);
    expect((10 - (sum % 10)) % 10).toBe(digits[12]);
  });

  it("compares barcodes without control characters or case", () => {
    expect(normalizeBarcode(" ab\u0000c\n")).toBe("ABC");
    const variants = [variant({ id: "a", barcode: "abc" })];
    expect(isBarcodeInUse(variants, "ABC\r")).toBe(true);
    expect(isBarcodeInUse(variants, "ABC", "a")).toBe(false);
    expect(isBarcodeInUse(variants, "  ")).toBe(false);
  });
});

describe("newVariantValues", () => {
  const draft = { ...emptyVariantDraft(product), stock_main: "2", stock_incubator: "3" };

  it("prices below the regular price keep it as the original", () => {
    const { values } = newVariantValues({ ...draft, selling_price: "20" }, allVisible, product);
    expect(values).toMatchObject({
      selling_price: 20,
      original_price: 30,
      cost_price: 12,
      stock: 5,
    });
    expect(newVariantValues(draft, allVisible, product).values).toMatchObject({
      selling_price: 30,
      original_price: null,
    });
  });

  it("drops hidden axes but keeps a typed colour", () => {
    const hidden = { size: false, color: false, fabric: false, four: false, five: false };
    const { values } = newVariantValues(
      { ...draft, size: "S", color: "Red", fabric: "Silk" },
      hidden,
      product,
    );
    expect(values).toMatchObject({ size: null, color: "Red", fabric: null });
  });

  it("splits a composite size when no colour is given", () => {
    const { color, values } = newVariantValues(
      { ...draft, size: "700 - Dark", size_unit: "g" },
      allVisible,
      product,
    );
    expect(color).toBe("Dark");
    expect(values).toMatchObject({ size: "700", color: "Dark" });
  });
});

describe("variantColumnPatch", () => {
  it("leaves stock to the ledger and sets the original price from the new price", () => {
    expect(
      variantColumnPatch({ stock_main: 4, stock_incubator: 1, stock: 5, sku: "X" }, 30),
    ).toEqual({ sku: "X" });
    expect(variantColumnPatch({ selling_price: 20 }, 30)).toEqual({
      selling_price: 20,
      original_price: 30,
    });
    expect(variantColumnPatch({ selling_price: 30 }, 30)).toEqual({
      selling_price: 30,
      original_price: null,
    });
  });
});
