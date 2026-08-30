import { describe, expect, it } from "vitest";
import { isLowStock, isOutOfStock } from "../src/lib/inventory-health";

describe("inventory health", () => {
  it("keeps out-of-stock separate from low-stock", () => {
    expect(isOutOfStock(0)).toBe(true);
    expect(isLowStock(0, 10)).toBe(false);
  });

  it("flags the shared five-unit threshold", () => {
    expect(isLowStock(5, 0)).toBe(true);
    expect(isLowStock(6, 0)).toBe(false);
  });

  it("also flags stock below expected weekly demand", () => {
    expect(isLowStock(8, 10)).toBe(true);
    expect(isLowStock(10, 8)).toBe(false);
  });
});
