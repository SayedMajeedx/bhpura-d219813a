import { describe, it, expect } from "vitest";
import { calculateIncomeStatement } from "../src/lib/double-entry-ledger";

describe("Accounting, Dashboard & Reports Synchronization", () => {
  it("calculates Net Profit = +9.000 BHD for 3 confirmed unfulfilled orders without deducting packaging inventory asset", () => {
    const orders = [
      {
        id: "order-1",
        status: "confirmed",
        fulfillment_status: "ON_HOLD",
        total: 8,
        order_items: [{ quantity: 1, unit_cost: 5, packaging_cost: 0.571 }],
      },
      {
        id: "order-2",
        status: "confirmed",
        fulfillment_status: "ON_HOLD",
        total: 8,
        order_items: [{ quantity: 1, unit_cost: 5, packaging_cost: 0.571 }],
      },
      {
        id: "order-3",
        status: "confirmed",
        fulfillment_status: "ON_HOLD",
        total: 8,
        order_items: [{ quantity: 1, unit_cost: 5, packaging_cost: 0.571 }],
      },
    ];

    const expenses = [
      {
        id: "exp-1",
        expense_type: "cogs", // Bulk Packaging Inventory Purchase Asset
        amount: 53.95,
        category: "Packaging Materials",
      },
    ];

    const result = calculateIncomeStatement(orders, expenses, 0, 0);

    // 1. Gross & Net Revenue = 24.000 BHD (3 * 8.000)
    expect(result.netRevenue).toBe(24);

    // 2. Product COGS = 15.000 BHD (3 * 5.000)
    expect(result.productCogs).toBe(15);

    // 3. Packaging BOM COGS = 0.000 BHD (Orders are unfulfilled)
    expect(result.packagingBomCogs).toBe(0);

    // 4. Total COGS = 15.000 BHD
    expect(result.totalCogs).toBe(15);

    // 5. Operating Expenses = 0.000 BHD (Asset purchase of 53.950 BHD excluded)
    expect(result.operatingExpenses).toBe(0);

    // 6. Net Profit = 24.000 - 15.000 - 0 = +9.000 BHD
    expect(result.netOperatingProfit).toBe(9);
  });

  it("includes packaging BOM cost in COGS when orders are fulfilled/delivered", () => {
    const orders = [
      {
        id: "order-1",
        status: "completed",
        fulfillment_status: "DELIVERED",
        total: 8,
        order_items: [{ quantity: 1, unit_cost: 5, packaging_cost: 0.571 }],
      },
      {
        id: "order-2",
        status: "completed",
        fulfillment_status: "DELIVERED",
        total: 8,
        order_items: [{ quantity: 1, unit_cost: 5, packaging_cost: 0.571 }],
      },
      {
        id: "order-3",
        status: "completed",
        fulfillment_status: "DELIVERED",
        total: 8,
        order_items: [{ quantity: 1, unit_cost: 5, packaging_cost: 0.571 }],
      },
    ];

    const expenses: any[] = [];

    const result = calculateIncomeStatement(orders, expenses, 0, 0);

    expect(result.productCogs).toBe(15);
    expect(result.packagingBomCogs).toBe(1.713);
    expect(result.totalCogs).toBe(16.713);
    expect(result.netOperatingProfit).toBe(7.287);
  });
});
