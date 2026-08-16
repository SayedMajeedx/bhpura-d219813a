import { describe, it, expect } from "vitest";
import { calculateIncomeStatement } from "../src/lib/double-entry-ledger";

describe("Accounting & Net Profit logic for Unfulfilled Orders & Packaging Inventory Assets", () => {
  it("does NOT deduct bulk Packaging Inventory Asset from Net Profit and only deducts Packaging BOM when order is fulfilled", () => {
    // 1 Unfulfilled order with revenue 24.000, product cost 15.000, packaging cost 1.000
    const orders = [
      {
        id: "order-1",
        status: "confirmed",
        fulfillment_status: "ON_HOLD", // Unfulfilled
        total: 24,
        order_items: [
          {
            quantity: 1,
            unit_cost: 15,
            packaging_cost: 1,
          },
        ],
      },
    ];

    // Bulk Packaging purchase logged under 'cogs' (Asset)
    const expenses = [
      {
        id: "exp-1",
        expense_type: "cogs",
        amount: 53.95,
        category: "Packaging Materials",
      },
    ];

    const result = calculateIncomeStatement(orders, expenses, 0, 0);

    // 1. Packaging Inventory Asset (53.95) must NOT be deducted in operatingExpenses
    expect(result.operatingExpenses).toBe(0);

    // 2. Unfulfilled order: Packaging BOM (1.000) must NOT be deducted in COGS yet
    expect(result.productCogs).toBe(15);
    expect(result.packagingBomCogs).toBe(0);
    expect(result.totalCogs).toBe(15);

    // 3. Net Profit = Revenue (24) - Product COGS (15) = +9.000
    expect(result.netRevenue).toBe(24);
    expect(result.netOperatingProfit).toBe(9);
  });

  it("deducts Packaging BOM COGS once order fulfillment_status becomes COMPLETED or FULFILLED", () => {
    const orders = [
      {
        id: "order-1",
        status: "completed",
        fulfillment_status: "COMPLETED", // Fulfilled
        total: 24,
        order_items: [
          {
            quantity: 1,
            unit_cost: 15,
            packaging_cost: 1,
          },
        ],
      },
    ];

    const expenses: any[] = [];

    const result = calculateIncomeStatement(orders, expenses, 0, 0);

    expect(result.productCogs).toBe(15);
    expect(result.packagingBomCogs).toBe(1);
    expect(result.totalCogs).toBe(16);
    expect(result.netOperatingProfit).toBe(8);
  });
});
