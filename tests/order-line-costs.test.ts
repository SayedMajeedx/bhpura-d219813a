import { describe, expect, it } from "vitest";
import { lineCosts, newLineCost, unknownCostNote } from "../src/features/orders/lib/line-costs";

describe("an order's line costs", () => {
  it("adds the known costs and counts the pieces with none", () => {
    expect(
      lineCosts([
        { product_id: "a", quantity: 2, unit_cost: 10 },
        { product_id: "b", quantity: 3, unit_cost: null },
        { variant_id: "c", quantity: "1", unit_cost: "" },
        { product_id: "d", quantity: 1, unit_cost: 0 },
      ]),
    ).toEqual({ known: 20, unknownPieces: 4 });
  });

  it("does not count a hand-typed line with no product as unknown", () => {
    expect(lineCosts([{ quantity: 5, unit_cost: null }])).toEqual({ known: 0, unknownPieces: 0 });
  });

  it("gives a new line only a cost above zero", () => {
    expect(newLineCost(12.5)).toBe(12.5);
    expect(newLineCost("3")).toBe(3);
    expect(newLineCost(0)).toBeNull();
    expect(newLineCost(null)).toBeNull();
    expect(newLineCost(undefined)).toBeNull();
  });

  it("says how many pieces have no cost, in the reader's language", () => {
    expect(unknownCostNote(1, "en")).toContain("1 piece,");
    expect(unknownCostNote(3, "en")).toContain("3 pieces");
    expect(unknownCostNote(2, "ar")).toContain("قطعتان");
    expect(unknownCostNote(3, "ar")).toContain("3 قطع");
  });
});
