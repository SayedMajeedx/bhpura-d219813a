import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  calculateReturnFinancials,
  checkOrderReturnEligibility,
  calculateExchangePriceDifference,
  generateReturnNumber,
} from "../src/lib/returns.functions";
import { dispatchReturnNotificationSafely } from "../src/lib/return-notifications";
import type { BrandReturnPolicy } from "../src/lib/returns.types";

describe("Returns & Exchanges Suite - Core Business Logic & Financial Integrity", () => {
  const defaultPolicy: BrandReturnPolicy = {
    id: "pol-1",
    brand_id: "brand-test-1",
    return_window_days: 14,
    allow_partial_returns: true,
    allow_discounted_items: true,
    excluded_category_ids: [],
    excluded_product_ids: [],
    return_shipping_fee: 1.5,
    customer_shipping_fee_borne_by: "customer",
    allowed_compensation_methods: ["refund_original", "store_credit", "exchange"],
    require_images: false,
    auto_approve_policy: false,
    policy_terms_ar: "الشروط",
    policy_terms_en: "Terms",
    notify_on_status_change: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  describe("1. Pro-Rated Financial Calculations", () => {
    it("should calculate exact pro-rated discount deduction for partial return", () => {
      // Order had Subtotal 100, Discount 20 (20%), Tax 8, Total 88
      // Returning items worth 40 (40% of original subtotal)
      const res = calculateReturnFinancials({
        items: [{ unitPrice: 20, quantity: 2 }],
        order: {
          subtotal: 100,
          discount: 20,
          taxAmount: 8,
          total: 88,
        },
        policy: defaultPolicy,
      });

      expect(res.totalItemRefund).toBe(40);
      // Pro-rated discount: 20 * (40 / 100) = 8
      expect(res.proRatedDiscount).toBe(8);
      // Taxable amount: 40 - 8 = 32. Tax at 8%: 32 * 0.08 = 2.56
      expect(res.taxRefund).toBe(2.56);
      // Return shipping fee borne by customer: 1.5
      expect(res.returnFee).toBe(1.5);
      // Net refund: 32 + 2.56 - 1.5 = 33.06
      expect(res.netRefundAmount).toBe(33.06);
    });

    it("should handle full order return with zero return fee if borne by brand", () => {
      const freeShippingPolicy: BrandReturnPolicy = {
        ...defaultPolicy,
        customer_shipping_fee_borne_by: "brand",
        return_shipping_fee: 2.0,
      };

      const res = calculateReturnFinancials({
        items: [{ unitPrice: 50, quantity: 2 }],
        order: {
          subtotal: 100,
          discount: 10,
          taxAmount: 9,
          total: 99,
        },
        policy: freeShippingPolicy,
      });

      expect(res.totalItemRefund).toBe(100);
      expect(res.proRatedDiscount).toBe(10);
      // Tax on discounted base (90 * 0.09) = 8.1
      expect(res.taxRefund).toBe(8.1);
      expect(res.returnFee).toBe(0);
      // Net refund = 90 + 8.1 - 0 = 98.1
      expect(res.netRefundAmount).toBe(98.1);
    });

    it("should never return negative net refund even if return fee exceeds items", () => {
      const highFeePolicy: BrandReturnPolicy = {
        ...defaultPolicy,
        return_shipping_fee: 25.0,
      };

      const res = calculateReturnFinancials({
        items: [{ unitPrice: 5, quantity: 1 }],
        order: {
          subtotal: 10,
          discount: 0,
          taxAmount: 0,
          total: 10,
        },
        policy: highFeePolicy,
      });

      expect(res.totalItemRefund).toBe(5);
      expect(res.netRefundAmount).toBe(0);
    });
  });

  describe("2. Return Window & Eligibility Rules", () => {
    it("should approve eligibility for recent delivered order within return window", () => {
      const recentOrderDate = new Date();
      recentOrderDate.setDate(recentOrderDate.getDate() - 5); // 5 days ago

      const res = checkOrderReturnEligibility(
        {
          created_at: recentOrderDate.toISOString(),
          status: "delivered",
        },
        defaultPolicy,
      );

      expect(res.eligible).toBe(true);
      expect(res.daysSinceOrder).toBe(5);
    });

    it("should reject eligibility when return window is expired", () => {
      const oldOrderDate = new Date();
      oldOrderDate.setDate(oldOrderDate.getDate() - 20); // 20 days ago (policy is 14 days)

      const res = checkOrderReturnEligibility(
        {
          created_at: oldOrderDate.toISOString(),
          status: "delivered",
        },
        defaultPolicy,
      );

      expect(res.eligible).toBe(false);
      expect(res.reason).toContain("تجاوز الطلب فترة الإرجاع المسموحة");
    });

    it("should reject cancelled or unpaid orders from returns", () => {
      const res = checkOrderReturnEligibility(
        {
          created_at: new Date().toISOString(),
          status: "cancelled",
        },
        defaultPolicy,
      );

      expect(res.eligible).toBe(false);
    });
  });

  describe("3. Exchange Price Difference Engine", () => {
    it("should calculate customer payment delta when replacement is higher price", () => {
      // Returned item value: 30 BHD, Replacement items total: 45 BHD
      const res = calculateExchangePriceDifference(30, 45);

      expect(res.direction).toBe("customer_pays");
      expect(res.priceDifference).toBe(15);
      expect(res.labelEn).toContain("Customer Pays");
    });

    it("should calculate brand refund delta when replacement is lower price", () => {
      // Returned item value: 50 BHD, Replacement items total: 35 BHD
      const res = calculateExchangePriceDifference(50, 35);

      expect(res.direction).toBe("brand_refunds");
      expect(res.priceDifference).toBe(15);
      expect(res.labelEn).toContain("Brand Refunds");
    });

    it("should detect even exchange with zero delta", () => {
      // Returned item value: 25 BHD, Replacement items total: 25 BHD
      const res = calculateExchangePriceDifference(25, 25);

      expect(res.direction).toBe("even");
      expect(res.priceDifference).toBe(0);
      expect(res.labelEn).toContain("Even Exchange");
    });
  });

  describe("4. Return Tracking Number Generator", () => {
    it("should format standardized prefix and uppercase alphanumeric sequence", () => {
      const num = generateReturnNumber();
      expect(num).toMatch(/^RET-[A-Z0-9]{8}$/);
    });
  });

  describe("5. Safe Notification Dispatch Resilience", () => {
    it("should gracefully log and not throw when notification delivery fails", () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      expect(() => {
        dispatchReturnNotificationSafely({
          brandId: "brand-1",
          returnId: "ret-1",
          eventType: "return_created",
          recipientEmail: "test@example.com",
          customerName: "Ahmed",
          returnNumber: "RET-12345678",
        });
      }).not.toThrow();

      consoleErrorSpy.mockRestore();
    });
  });

  describe("6. Migration Schema & Multi-Tenant RLS Security", () => {
    const migrationSql = readFileSync(
      "supabase/migrations/20260829120000_returns_and_exchanges_suite.sql",
      "utf8",
    );

    it("should define all required multi-tenant tables", () => {
      expect(migrationSql).toContain("CREATE TABLE IF NOT EXISTS public.brand_return_policies");
      expect(migrationSql).toContain("CREATE TABLE IF NOT EXISTS public.return_requests");
      expect(migrationSql).toContain("CREATE TABLE IF NOT EXISTS public.return_items");
      expect(migrationSql).toContain("CREATE TABLE IF NOT EXISTS public.store_credits");
      expect(migrationSql).toContain("CREATE TABLE IF NOT EXISTS public.inventory_movement_logs");
      expect(migrationSql).toContain("CREATE TABLE IF NOT EXISTS public.return_notification_events");
    });

    it("should enforce RLS and brand isolation policies", () => {
      expect(migrationSql).toContain("ENABLE ROW LEVEL SECURITY");
      expect(migrationSql).toContain("can_access_brand(brand_id)");
      expect(migrationSql).toContain("has_permission('manage_orders')");
    });

    it("should provide atomic RPCs with SECURITY DEFINER and search_path", () => {
      expect(migrationSql).toContain("rpc_create_return_request");
      expect(migrationSql).toContain("rpc_inspect_and_restock_return_item");
      expect(migrationSql).toContain("rpc_process_return_refund");
      expect(migrationSql).toContain("rpc_create_exchange_replacement_order");
      expect(migrationSql).toContain("SECURITY DEFINER");
      expect(migrationSql).toContain("SET search_path = public");
    });
  });
});
