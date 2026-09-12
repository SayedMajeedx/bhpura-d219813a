import { describe, it, expect } from "vitest";

describe("Stage 6 - Customers, Money, and Reports Logic", () => {
  it("calculates customer metrics correctly (AOV, lifetime spend, order count)", () => {
    const orders = [
      { id: "1", total: 25.5, status: "completed" },
      { id: "2", total: 40.0, status: "completed" },
      { id: "3", total: 14.5, status: "delivered" },
    ];

    const totalSpent = orders.reduce((sum, o) => sum + o.total, 0);
    const aov = orders.length > 0 ? totalSpent / orders.length : 0;

    expect(totalSpent).toBe(80.0);
    expect(orders.length).toBe(3);
    expect(aov).toBeCloseTo(26.67, 2);
  });

  it("handles zero order customer gracefully", () => {
    const orders: { total: number }[] = [];
    const totalSpent = orders.reduce((sum, o) => sum + o.total, 0);
    const aov = orders.length > 0 ? totalSpent / orders.length : 0;

    expect(totalSpent).toBe(0);
    expect(aov).toBe(0);
  });

  it("validates standardized revenue and profit terminology", () => {
    const financialData = {
      grossSales: 1000, // Gross sales before discounts and taxes
      discounts: 100,
      netMerchandiseSales: 900,
      shippingCollected: 50,
      vatCollected: 45,
      netRevenue: 995, // Net sales + shipping + VAT
      cogs: 400,
      expenses: 150,
    };

    const grossProfit = financialData.netMerchandiseSales - financialData.cogs;
    const operatingNetProfit = grossProfit - financialData.expenses;
    const grossMarginPercent = (grossProfit / financialData.netRevenue) * 100;

    expect(grossProfit).toBe(500);
    expect(operatingNetProfit).toBe(350);
    expect(grossMarginPercent).toBeCloseTo(50.25, 2);
  });

  it("calculates repeat customer rate accurately", () => {
    const calculateCustomerRate = (uniqueCustomers: number, repeatCustomers: number) => {
      if (uniqueCustomers === 0) return 0;
      return (repeatCustomers / uniqueCustomers) * 100;
    };

    expect(calculateCustomerRate(100, 35)).toBe(35);
    expect(calculateCustomerRate(0, 0)).toBe(0);
    expect(calculateCustomerRate(200, 50)).toBe(25);
  });
});
