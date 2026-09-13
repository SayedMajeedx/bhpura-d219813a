import { describe, expect, it } from "vitest";

/**
 * Pure calculation logic matching OrderQuickViewModal and admin order details.
 */
interface OrderFinancialInput {
  subtotal: number;
  discount?: number;
  shipping?: number;
  tax?: number;
  advancePaid?: number;
  productCogs?: number;
  packagingCogs?: number;
}

function calculateOrderProfitBreakdown(input: OrderFinancialInput) {
  const subtotal = Math.max(0, Number(input.subtotal || 0));
  const discount = Math.max(0, Number(input.discount || 0));
  const shipping = Math.max(0, Number(input.shipping || 0));
  const tax = Math.max(0, Number(input.tax || 0));
  const advancePaid = Math.max(0, Number(input.advancePaid || 0));

  // Net total formula
  const netTotal = Number((subtotal - discount + shipping + tax).toFixed(3));
  // COD balance remaining
  const codRemaining = Number(Math.max(0, netTotal - advancePaid).toFixed(3));

  // COGS and profit
  const productCogs = Number((input.productCogs || 0).toFixed(3));
  const packagingCogs = Number((input.packagingCogs || 0).toFixed(3));
  const totalCogs = Number((productCogs + packagingCogs).toFixed(3));
  const netProfit = Number((netTotal - totalCogs).toFixed(3));
  const profitMarginPercent = netTotal > 0 ? Number(((netProfit / netTotal) * 100).toFixed(1)) : 0;

  // Profit label logic: unpaid/pending COD gives expected profit; fully collected gives realized/estimated profit
  const isFullyCollected = codRemaining === 0 && netTotal > 0;
  const profitLabelEn =
    codRemaining > 0 ? "Estimated gross profit after full collection" : "Estimated gross profit";
  const profitLabelAr =
    codRemaining > 0 ? "الربح الإجمالي المتوقع بعد التحصيل الكامل" : "الربح الإجمالي التقديري";

  return {
    subtotal,
    discount,
    shipping,
    tax,
    netTotal,
    advancePaid,
    codRemaining,
    productCogs,
    packagingCogs,
    totalCogs,
    netProfit,
    profitMarginPercent,
    isFullyCollected,
    profitLabelEn,
    profitLabelAr,
  };
}

describe("Order Profit & Financial Clarity Behavioral Suite", () => {
  describe("Net Total & COD Balance Calculations", () => {
    it("calculates exact net total with subtotal, discount, shipping, and tax", () => {
      const res = calculateOrderProfitBreakdown({
        subtotal: 50.0,
        discount: 5.0,
        shipping: 2.5,
        tax: 4.75,
      });

      // 50 - 5 + 2.5 + 4.75 = 52.250
      expect(res.netTotal).toBe(52.25);
      expect(res.codRemaining).toBe(52.25);
      expect(res.isFullyCollected).toBe(false);
      expect(res.profitLabelEn).toBe("Estimated gross profit after full collection");
      expect(res.profitLabelAr).toBe("الربح الإجمالي المتوقع بعد التحصيل الكامل");
    });

    it("deducts advance deposit accurately and clears COD balance when fully paid", () => {
      const res = calculateOrderProfitBreakdown({
        subtotal: 30.0,
        discount: 0,
        shipping: 2.0,
        tax: 0,
        advancePaid: 32.0, // 100% paid upfront
      });

      expect(res.netTotal).toBe(32.0);
      expect(res.advancePaid).toBe(32.0);
      expect(res.codRemaining).toBe(0);
      expect(res.isFullyCollected).toBe(true);
      expect(res.profitLabelEn).toBe("Estimated gross profit");
      expect(res.profitLabelAr).toBe("الربح الإجمالي التقديري");
    });

    it("handles partial advance deposit leaving remaining COD balance", () => {
      const res = calculateOrderProfitBreakdown({
        subtotal: 100.0,
        discount: 10.0,
        shipping: 3.0,
        tax: 0,
        advancePaid: 40.0,
      });

      // Net total: 100 - 10 + 3 = 93.000. Paid: 40.000. Due: 53.000
      expect(res.netTotal).toBe(93.0);
      expect(res.codRemaining).toBe(53.0);
      expect(res.isFullyCollected).toBe(false);
      expect(res.profitLabelEn).toContain("Estimated gross profit after full collection");
    });

    it("prevents negative COD balance when advance deposit exceeds total", () => {
      const res = calculateOrderProfitBreakdown({
        subtotal: 20.0,
        advancePaid: 25.0,
      });

      expect(res.netTotal).toBe(20.0);
      expect(res.codRemaining).toBe(0);
    });
  });

  describe("COGS Breakdown & Profit Margin Invariants", () => {
    it("calculates positive gross profit and profit margin percentage", () => {
      const res = calculateOrderProfitBreakdown({
        subtotal: 45.0,
        discount: 0,
        shipping: 2.0,
        tax: 0,
        productCogs: 18.0,
        packagingCogs: 1.5,
      });

      // Net total: 47.000. Total COGS: 19.500. Profit: 47 - 19.5 = 27.500
      expect(res.totalCogs).toBe(19.5);
      expect(res.netProfit).toBe(27.5);
      // Margin: (27.5 / 47.0) * 100 = 58.5106... -> 58.5%
      expect(res.profitMarginPercent).toBe(58.5);
    });

    it("calculates negative gross profit when COGS exceeds net revenue", () => {
      const res = calculateOrderProfitBreakdown({
        subtotal: 20.0,
        discount: 5.0, // net: 15.000
        productCogs: 22.0, // cost exceeds price
        packagingCogs: 2.0,
      });

      expect(res.netTotal).toBe(15.0);
      expect(res.totalCogs).toBe(24.0);
      expect(res.netProfit).toBe(-9.0);
      expect(res.profitMarginPercent).toBe(-60.0);
    });

    it("handles zero revenue and zero COGS gracefully without division by zero", () => {
      const res = calculateOrderProfitBreakdown({
        subtotal: 0,
      });

      expect(res.netTotal).toBe(0);
      expect(res.totalCogs).toBe(0);
      expect(res.netProfit).toBe(0);
      expect(res.profitMarginPercent).toBe(0);
      expect(Number.isNaN(res.profitMarginPercent)).toBe(false);
    });

    it("maintains 3 decimal precision for Bahrain Dinar (BHD)", () => {
      const res = calculateOrderProfitBreakdown({
        subtotal: 12.333,
        discount: 2.111,
        shipping: 1.555,
        tax: 0.888,
        productCogs: 5.123,
        packagingCogs: 0.571,
      });

      // Net: 12.333 - 2.111 + 1.555 + 0.888 = 12.665
      expect(res.netTotal).toBe(12.665);
      // Total COGS: 5.123 + 0.571 = 5.694
      expect(res.totalCogs).toBe(5.694);
      // Profit: 12.665 - 5.694 = 6.971
      expect(res.netProfit).toBe(6.971);
    });
  });
});
