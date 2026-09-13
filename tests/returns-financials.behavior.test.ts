import { describe, expect, it } from "vitest";
import {
  calculateReturnFinancials,
  checkOrderReturnEligibility,
  calculateExchangePriceDifference,
} from "../src/lib/returns.functions";
import type { BrandReturnPolicy } from "../src/lib/returns.types";

describe("Returns & Exchanges Financial Calculations Behavioral Suite", () => {
  describe("calculateReturnFinancials", () => {
    it("pro-rates discount and tax accurately for partial returns", () => {
      // Order: Subtotal 100 BHD, Discount 20 BHD (20%), Tax Rate 10%
      // Customer returns 1 item of 50 BHD
      const breakdown = calculateReturnFinancials({
        items: [{ unitPrice: 50.0, quantity: 1 }],
        order: {
          subtotal: 100.0,
          discount: 20.0,
          taxRate: 10,
          total: 88.0,
        },
        policy: {
          customer_shipping_fee_borne_by: "brand",
        },
      });

      // Item refund: 50.000
      expect(breakdown.totalItemRefund).toBe(50.0);
      // Pro-rated discount: 50 * (20/100) = 10.000
      expect(breakdown.proRatedDiscount).toBe(10.0);
      // Taxable net: 50 - 10 = 40.000. Tax refund: 40 * 10% = 4.000
      expect(breakdown.taxRefund).toBe(4.0);
      // Return fee: 0
      expect(breakdown.returnFee).toBe(0);
      // Net refund: 40 + 4 = 44.000
      expect(breakdown.netRefundAmount).toBe(44.0);
    });

    it("deducts return shipping fee when borne by customer", () => {
      const breakdown = calculateReturnFinancials({
        items: [{ unitPrice: 30.0, quantity: 1 }],
        order: {
          subtotal: 30.0,
          discount: 0,
          total: 30.0,
        },
        policy: {
          customer_shipping_fee_borne_by: "customer",
          return_shipping_fee: 2.5,
        },
      });

      expect(breakdown.totalItemRefund).toBe(30.0);
      expect(breakdown.returnFee).toBe(2.5);
      expect(breakdown.netRefundAmount).toBe(27.5);
    });

    it("caps net refund at 0 when return fee exceeds returned item value", () => {
      const breakdown = calculateReturnFinancials({
        items: [{ unitPrice: 2.0, quantity: 1 }],
        order: {
          subtotal: 2.0,
          discount: 0,
          total: 2.0,
        },
        policy: {
          customer_shipping_fee_borne_by: "customer",
          return_shipping_fee: 5.0,
        },
      });

      expect(breakdown.totalItemRefund).toBe(2.0);
      expect(breakdown.returnFee).toBe(5.0);
      expect(breakdown.netRefundAmount).toBe(0);
    });

    it("maintains 3 decimal precision for Bahrain Dinar", () => {
      const breakdown = calculateReturnFinancials({
        items: [{ unitPrice: 15.333, quantity: 1 }],
        order: {
          subtotal: 46.0,
          discount: 6.9, // 15% discount
          taxRate: 10,
          total: 43.01,
        },
      });

      // Item refund: 15.333
      expect(breakdown.totalItemRefund).toBe(15.333);
      // Pro-rated discount: 15.333 * (6.9 / 46.0) = 15.333 * 0.15 = 2.29995 -> 2.300
      expect(breakdown.proRatedDiscount).toBe(2.3);
      // Taxable: 15.333 - 2.300 = 13.033. Tax refund: 13.033 * 0.10 = 1.3033 -> 1.303
      expect(breakdown.taxRefund).toBe(1.303);
      // Net refund: 13.033 + 1.303 = 14.336
      expect(breakdown.netRefundAmount).toBe(14.336);
    });
  });

  describe("calculateExchangePriceDifference", () => {
    it("detects when customer owes money for higher value exchange", () => {
      const result = calculateExchangePriceDifference(40.0, 55.0);
      expect(result.direction).toBe("customer_pays");
      expect(result.priceDifference).toBe(15.0);
      expect(result.labelEn).toContain("Customer Pays");
      expect(result.labelAr).toContain("مطلوب من العميل");
    });

    it("detects when brand must refund money for lower value exchange", () => {
      const result = calculateExchangePriceDifference(50.0, 35.0);
      expect(result.direction).toBe("brand_refunds");
      expect(result.priceDifference).toBe(15.0);
      expect(result.labelEn).toContain("Brand Refunds");
      expect(result.labelAr).toContain("يُرد للعميل");
    });

    it("detects even exchange with 0 price difference", () => {
      const result = calculateExchangePriceDifference(40.0, 40.0);
      expect(result.direction).toBe("even");
      expect(result.priceDifference).toBe(0);
      expect(result.labelEn).toContain("Even Exchange");
    });
  });

  describe("checkOrderReturnEligibility", () => {
    const mockPolicy: BrandReturnPolicy = {
      id: "pol-1",
      brand_id: "b-1",
      return_window_days: 14,
      allow_refunds: true,
      allow_exchanges: true,
      allow_discounted_items: false,
      customer_shipping_fee_borne_by: "customer",
      return_shipping_fee: 2.0,
      exchange_shipping_fee: 2.0,
      auto_approve_returns: false,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    it("allows return for eligible delivered order within 14-day window", () => {
      const recentDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(); // 3 days ago
      const result = checkOrderReturnEligibility(
        { created_at: recentDate, status: "delivered", discount: 0 },
        mockPolicy,
      );

      expect(result.eligible).toBe(true);
      expect(result.daysSinceOrder).toBe(3);
    });

    it("rejects return when order exceeds return window days", () => {
      const oldDate = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(); // 20 days ago
      const result = checkOrderReturnEligibility(
        { created_at: oldDate, status: "completed", discount: 0 },
        mockPolicy,
      );

      expect(result.eligible).toBe(false);
      expect(result.reason).toContain("تجاوز الطلب فترة الإرجاع");
    });

    it("rejects return for discounted order when policy disallows it", () => {
      const recentDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      const result = checkOrderReturnEligibility(
        { created_at: recentDate, status: "delivered", discount: 5.0 },
        mockPolicy,
      );

      expect(result.eligible).toBe(false);
      expect(result.reason).toContain("المنتجات المخفضة غير مؤهلة");
    });

    it("rejects return for cancelled or draft orders", () => {
      const recentDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
      const result = checkOrderReturnEligibility(
        { created_at: recentDate, status: "cancelled", discount: 0 },
        mockPolicy,
      );

      expect(result.eligible).toBe(false);
      expect(result.reason).toContain("الطلب غير مكتمل أو ملغي");
    });
  });
});
