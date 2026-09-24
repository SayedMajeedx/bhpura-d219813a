import { describe, expect, it } from "vitest";
import {
  matchingVariantsFor,
  offeredSizes,
  outOfStockByValue,
  parsePriceDelta,
  sortVariants,
  uniqueOptionValues,
  type VariantSelection,
} from "../src/features/product-page/lib/variant-options";
import {
  discountPercentFor,
  displayPriceFor,
  matchingPriceRange,
  originalPriceFor,
} from "../src/features/product-page/lib/pdp-pricing";
import type { StorefrontVariant } from "../src/lib/data/storefront";

const variant = (overrides: Partial<StorefrontVariant> = {}): StorefrontVariant =>
  ({
    id: "v",
    size: "52",
    color: "Black",
    fabric: null,
    option_four: null,
    option_five: null,
    selling_price: 30,
    original_price: null,
    stock_main: 1,
    stock_incubator: 0,
    ...overrides,
  }) as StorefrontVariant;

const none: VariantSelection = { size: null, color: null, fabric: null, four: null, five: null };

describe("option values", () => {
  it("sorts sizes numerically", () => {
    const sorted = sortVariants([
      variant({ id: "a", size: "60" }),
      variant({ id: "b", size: "52" }),
      variant({ id: "c", size: "54" }),
    ]);
    expect(sorted.map((v) => v.size)).toEqual(["52", "54", "60"]);
  });

  it("lists distinct non-empty values in order", () => {
    const variants = [
      variant({ color: "Black" }),
      variant({ color: null }),
      variant({ color: "Navy" }),
      variant({ color: "Black" }),
    ];
    expect(uniqueOptionValues(variants, (v) => v.color)).toEqual(["Black", "Navy"]);
  });

  it("offers sizes from real variants", () => {
    expect(offeredSizes([variant({ size: "52" }), variant({ size: "54" })])).toEqual(["52", "54"]);
  });
});

describe("selection", () => {
  const variants = [
    variant({ id: "b52", size: "52", color: "Black", stock_main: 0 }),
    variant({ id: "n52", size: "52", color: "Navy", stock_main: 2 }),
    variant({ id: "b54", size: "54", color: "Black", stock_main: 1 }),
  ];

  it("matches a partial selection", () => {
    expect(matchingVariantsFor(variants, { ...none, size: "52" }).map((v) => v.id)).toEqual([
      "b52",
      "n52",
    ]);
    expect(
      matchingVariantsFor(variants, { ...none, size: "52", color: "Navy" }).map((v) => v.id),
    ).toEqual(["n52"]);
  });

  it("marks a value out of stock for the other chosen options only", () => {
    expect(
      outOfStockByValue(variants, "color", ["Black", "Navy"], { ...none, size: "52" }),
    ).toEqual({ Black: true, Navy: false });
    // Its own axis is ignored: choosing Black does not hide Navy.
    expect(
      outOfStockByValue(variants, "color", ["Black", "Navy"], { ...none, color: "Black" }),
    ).toEqual({ Black: false, Navy: false });
    expect(outOfStockByValue(variants, "size", ["52", "60"], none)).toEqual({
      "52": false,
      "60": true,
    });
  });

  it("reads price additions from option values", () => {
    expect(parsePriceDelta("Embroidery + 5 BHD")).toBe(5);
    expect(parsePriceDelta("+2.5")).toBe(2.5);
    expect(parsePriceDelta("Plain")).toBe(0);
    expect(parsePriceDelta("")).toBe(0);
  });
});

describe("pricing", () => {
  it("uses the base price plus add-ons when nothing matches", () => {
    expect(matchingPriceRange([], 30, 5)).toEqual({ min: 35, max: 35 });
    expect(matchingPriceRange([35, 40], 30, 5)).toEqual({ min: 35, max: 40 });
  });

  it("shows the unique match, else the lowest price", () => {
    expect(displayPriceFor([variant({ selling_price: 40 })], 30, 5, 99)).toBe(45);
    expect(displayPriceFor([variant(), variant()], 30, 5, 35)).toBe(35);
  });

  it("prefers the variant's own original price", () => {
    expect(
      originalPriceFor({
        isRange: false,
        variant: variant({ selling_price: 25, original_price: 30 }),
        basePrice: 30,
        productOriginalPrice: 0,
      }),
    ).toBe(30);
    expect(
      originalPriceFor({ isRange: true, variant: null, basePrice: 30, productOriginalPrice: 40 }),
    ).toBe(0);
    expect(
      originalPriceFor({ isRange: false, variant: null, basePrice: 30, productOriginalPrice: 40 }),
    ).toBe(40);
  });

  it("rounds the discount to whole percent", () => {
    expect(discountPercentFor(40, 30)).toBe(25);
    expect(discountPercentFor(0, 30)).toBe(0);
    expect(discountPercentFor(30, 30)).toBe(0);
  });
});
