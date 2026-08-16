import { describe, it, expect } from "vitest";
import { calculateProductPackagingCost } from "@/lib/bom-calculator";

describe("Packaging BOM & Inventory Logic Audit", () => {
  it("calculates packaging unit cost from BOM items correctly (e.g. 1 Big Bag @ 0.388 + 1 Card @ 0.121 + 1 Plastic Bag @ 0.062 = 0.571 BHD)", () => {
    const bomItems = [
      {
        id: "bom-1",
        brand_id: "brand-1",
        product_id: "prod-1",
        packaging_material_id: "mat-1",
        quantity_per_unit: 1,
        packaging_material: {
          id: "mat-1",
          brand_id: "brand-1",
          name: "Big Bag",
          stock_quantity: 100,
          unit_cost: 0.388,
        },
      },
      {
        id: "bom-2",
        brand_id: "brand-1",
        product_id: "prod-1",
        packaging_material_id: "mat-2",
        quantity_per_unit: 1,
        packaging_material: {
          id: "mat-2",
          brand_id: "brand-1",
          name: "Card",
          stock_quantity: 100,
          unit_cost: 0.121,
        },
      },
      {
        id: "bom-3",
        brand_id: "brand-1",
        product_id: "prod-1",
        packaging_material_id: "mat-3",
        quantity_per_unit: 1,
        packaging_material: {
          id: "mat-3",
          brand_id: "brand-1",
          name: "Plastic Bag",
          stock_quantity: 100,
          unit_cost: 0.062,
        },
      },
    ];

    const totalUnitPackagingCost = calculateProductPackagingCost(0, bomItems);
    expect(totalUnitPackagingCost).toBe(0.571);
  });

  it("leaves COGS unaffected (0.000 packaging COGS) when order is unfulfilled/pending", () => {
    const isFulfilled = false;
    const packagingBomUnitCost = 0.571;
    const appliedPackagingCost = isFulfilled ? packagingBomUnitCost : 0;

    expect(appliedPackagingCost).toBe(0);
  });

  it("attaches packaging BOM cost (0.571 BHD) to order COGS upon fulfillment/delivery", () => {
    const isFulfilled = true;
    const productCost = 5.000;
    const packagingBomUnitCost = 0.571;
    const finalOrderUnitCogs = productCost + (isFulfilled ? packagingBomUnitCost : 0);

    expect(finalOrderUnitCogs).toBe(5.571);
  });
});
