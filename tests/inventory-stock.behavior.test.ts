import { describe, expect, it } from "vitest";
import { isOutOfStock, isLowStock } from "../src/lib/inventory-health";
import {
  calculateProductPackagingCost,
  matchProductForItem,
  getItemPackagingCost,
  type ProductBomItem,
  type PackagingMaterial,
} from "../src/lib/bom-calculator";

describe("Inventory Stock & BOM Packaging Calculations Behavioral Suite", () => {
  describe("Multi-Location Stock Aggregation Math", () => {
    it("sums main stock and incubator stock across variants accurately", () => {
      const variants = [
        { id: "v1", stock_main: 5, stock_incubator: 2 },
        { id: "v2", stock_main: 0, stock_incubator: 4 },
        { id: "v3", stock_main: 10, stock_incubator: 0 },
      ];

      const totalStock = variants.reduce(
        (sum, v) => sum + (Number(v.stock_main || 0) + Number(v.stock_incubator || 0)),
        0,
      );

      // (5 + 2) + (0 + 4) + (10 + 0) = 21
      expect(totalStock).toBe(21);
    });

    it("ensures zeroing stock_main does not resurrect stale legacy stock", () => {
      // Prior bug: variant.stock || variant.stock_main || 0 evaluated 13 || 0 -> 13
      const variant = {
        id: "v-relocated",
        stock_main: 0,
        stock_incubator: 1,
        stock: 13, // legacy column
      };

      const computedStock = Number(variant.stock_main ?? 0) + Number(variant.stock_incubator ?? 0);
      expect(computedStock).toBe(1);
    });

    it("handles null and undefined location values safely as zero", () => {
      const variant = {
        id: "v-nulls",
        stock_main: null,
        stock_incubator: undefined,
      };

      const computedStock = Number(variant.stock_main ?? 0) + Number(variant.stock_incubator ?? 0);
      expect(computedStock).toBe(0);
    });
  });

  describe("Inventory Health Checks", () => {
    it("isOutOfStock returns true for 0 or negative quantities and false for positive quantities", () => {
      expect(isOutOfStock(0)).toBe(true);
      expect(isOutOfStock(-1)).toBe(true);
      expect(isOutOfStock(NaN)).toBe(true);
      expect(isOutOfStock(1)).toBe(false);
      expect(isOutOfStock(50)).toBe(false);
    });

    it("isLowStock detects low inventory when stock is at or below threshold", () => {
      // Default low stock units = 5
      expect(isLowStock(5)).toBe(true);
      expect(isLowStock(3)).toBe(true);
      expect(isLowStock(6)).toBe(false);

      // When stock is 0, it is out-of-stock, not low-stock
      expect(isLowStock(0)).toBe(false);

      // Considers weekly sales velocity
      expect(isLowStock(10, 15)).toBe(true); // Stock 10 < weekly sales 15
      expect(isLowStock(20, 15)).toBe(false); // Stock 20 >= weekly sales 15
    });
  });

  describe("Packaging BOM Calculations", () => {
    const packagingMaterials: PackagingMaterial[] = [
      { id: "mat-box", brand_id: "b-1", name: "Luxury Box", stock_quantity: 50, unit_cost: 0.45 },
      { id: "mat-bag", brand_id: "b-1", name: "Paper Bag", stock_quantity: 100, unit_cost: 0.15 },
      {
        id: "mat-tag",
        brand_id: "b-1",
        name: "Ribbon & Tag",
        stock_quantity: 200,
        unit_cost: 0.05,
      },
    ];

    const bomItems: ProductBomItem[] = [
      {
        brand_id: "b-1",
        product_id: "prod-1",
        packaging_material_id: "mat-box",
        quantity_per_unit: 1,
        packaging_material: packagingMaterials[0],
      },
      {
        brand_id: "b-1",
        product_id: "prod-1",
        packaging_material_id: "mat-bag",
        quantity_per_unit: 1,
        packaging_material: packagingMaterials[1],
      },
      {
        brand_id: "b-1",
        product_id: "prod-1",
        packaging_material_id: "mat-tag",
        quantity_per_unit: 2, // 2 tags @ 0.050 each = 0.100
        packaging_material: packagingMaterials[2],
      },
    ];

    it("calculates product packaging cost combining direct packaging and BOM components", () => {
      // BOM cost = 0.450 + 0.150 + (2 * 0.050) = 0.700 BHD
      // Direct packaging cost = 0.100 BHD
      const totalCost = calculateProductPackagingCost(0.1, bomItems);
      expect(totalCost).toBe(0.8);
    });

    it("handles null direct packaging cost and empty BOM gracefully", () => {
      expect(calculateProductPackagingCost(null, bomItems)).toBe(0.7);
      expect(calculateProductPackagingCost(0.25, [])).toBe(0.25);
      expect(calculateProductPackagingCost(null, [])).toBe(0);
    });

    it("matches catalog product for order line items by id, variant_id, or title", () => {
      const products = [
        { id: "prod-1", name: "Silk Abaya", name_ar: "عباية حرير" },
        { id: "prod-2", name: "Linen Dress", name_ar: "فستان كتان" },
      ];
      const variants = [
        { id: "var-1", product_id: "prod-1" },
        { id: "var-2", product_id: "prod-2" },
      ];

      // Match by product_id
      expect(matchProductForItem({ product_id: "prod-1" }, products, variants)).toEqual(
        products[0],
      );

      // Match by variant_id
      expect(matchProductForItem({ variant_id: "var-2" }, products, variants)).toEqual(products[1]);

      // Fuzzy match by Arabic description
      expect(
        matchProductForItem({ description: "طلب عباية حرير مقاس 54" }, products, variants),
      ).toEqual(products[0]);

      // Unmatched returns null
      expect(matchProductForItem({ description: "عطر مخصص" }, products, variants)).toBeNull();
    });

    it("prioritizes immutable packaging cost snapshot on completed orders", () => {
      const item = {
        packaging_cost_snapshot: 0.65,
        packaging_cost: 0.9,
        product_id: "prod-1",
      };

      const cost = getItemPackagingCost(item, [], [], bomItems, packagingMaterials);
      expect(cost).toBe(0.65);
    });

    it("falls back to attached packaging_cost property when snapshot is absent", () => {
      const item = {
        packaging_cost_snapshot: null,
        packaging_cost: 0.9,
        product_id: "prod-1",
      };

      const cost = getItemPackagingCost(item, [], [], bomItems, packagingMaterials);
      expect(cost).toBe(0.9);
    });
  });
});
