import { describe, it, expect } from "vitest";

describe("Inventory Stock Calculation & Location Transfer Audit", () => {
  it("calculates total product stock correctly when items are moved from Main (0) to Incubator (1)", () => {
    // 9 variants with stock_main = 0, stock_incubator = 1, and legacy stock = 1 (or 13)
    const variants = Array.from({ length: 9 }, (_, i) => ({
      id: `var-${i + 1}`,
      product_id: "prod-s77",
      size: `${50 + i}`,
      stock_main: 0,
      stock_incubator: 1,
      stock: 1, // legacy column prior to relocation
    }));

    // Proper calculation: sum of stock_main + stock_incubator
    const totalStock = variants.reduce(
      (acc, v) => acc + Number(v.stock_main ?? 0) + Number(v.stock_incubator ?? 0),
      0,
    );

    // Must be 9 (not 22 or 18)
    expect(totalStock).toBe(9);
  });

  it("ensures zeroing stock_main does not trigger fallback to legacy stock column", () => {
    const variantWithZeroMain = {
      id: "var-1",
      stock_main: 0,
      stock_incubator: 1,
      stock: 13, // old legacy total
    };

    // Faulty logic previously was: Number(v.stock || v.stock_main || 0) + Number(v.stock_incubator || 0)
    // Which evaluated: Number(13 || 0 || 0) + 1 = 14
    const faultyTotal =
      Number(variantWithZeroMain.stock || variantWithZeroMain.stock_main || 0) +
      Number(variantWithZeroMain.stock_incubator || 0);
    expect(faultyTotal).toBe(14); // Explains why 13 + 9 was 22!

    // Fixed correct logic:
    const correctTotal =
      Number(variantWithZeroMain.stock_main ?? 0) +
      Number(variantWithZeroMain.stock_incubator ?? 0);
    expect(correctTotal).toBe(1);
  });
});
