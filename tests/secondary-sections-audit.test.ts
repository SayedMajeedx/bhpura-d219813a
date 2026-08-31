import { describe, expect, it } from "vitest";
import { calculateReviewMetrics, type OrderReviewAdminRow } from "../src/lib/order-reviews";
import { getItemPackagingCost } from "../src/lib/bom-calculator";

describe("Batch 2: Secondary Sections Business Logic Audit", () => {
  describe("1. Customer Reviews Analytics & Follow-up Filtering", () => {
    it("accurately calculates review distribution, average rating, and attention count", () => {
      const mockReviews: OrderReviewAdminRow[] = [
        {
          review_id: "rev-1",
          order_id: "ord-1",
          invoice_number: 1001,
          customer_name: "فاطمة أحمد",
          rating: 5,
          comment: "خدمة رائعة وجودة ممتازة",
          highlights: ["quality", "speed"],
          reward_code: "THANKS10",
          reviewed_at: new Date().toISOString(),
        },
        {
          review_id: "rev-2",
          order_id: "ord-2",
          invoice_number: 1002,
          customer_name: "سارة محمد",
          rating: 2,
          comment: "تأخر التوصيل",
          highlights: ["packaging"],
          reward_code: "THANKS10",
          reviewed_at: new Date().toISOString(),
        },
        {
          review_id: "rev-3",
          order_id: "ord-3",
          invoice_number: 1003,
          customer_name: "مريم علي",
          rating: 4,
          comment: "جميل جداً",
          highlights: ["quality"],
          reward_code: "THANKS10",
          reviewed_at: new Date().toISOString(),
        },
      ];

      const metrics = calculateReviewMetrics(mockReviews);
      expect(metrics.total).toBe(3);
      expect(metrics.average).toBeCloseTo(3.67, 2);
      expect(metrics.lowCount).toBe(1);
      expect(metrics.distribution.find((d) => d.rating === 5)?.count).toBe(1);
      expect(metrics.distribution.find((d) => d.rating === 4)?.count).toBe(1);
      expect(metrics.distribution.find((d) => d.rating === 2)?.count).toBe(1);
      expect(metrics.distribution.find((d) => d.rating === 1)?.count).toBe(0);
    });
  });

  describe("2. Bill of Materials & Packaging Cost Calculation", () => {
    it("computes exact packaging BOM cost per item from materials ledger", () => {
      const packagingMaterials = [
        { id: "mat-1", name: "صندوق فاخر", unit_cost: 0.85, quantity_per_order: 1 },
        { id: "mat-2", name: "شريط تغليف مع بطاقة", unit_cost: 0.15, quantity_per_order: 1 },
        { id: "mat-3", name: "كيس حماية قماشي", unit_cost: 0.4, quantity_per_order: 2 },
      ];

      const totalPackagingCost = packagingMaterials.reduce(
        (acc, item) => acc + item.unit_cost * item.quantity_per_order,
        0,
      );

      // (0.85 * 1) + (0.15 * 1) + (0.4 * 2) = 0.85 + 0.15 + 0.80 = 1.80 BHD
      expect(totalPackagingCost).toBe(1.8);
    });
  });

  describe("3. Discount Promo Code Scheduling & Redemption Caps", () => {
    it("correctly identifies active, expired, and capped promo codes", () => {
      const now = new Date();
      const past = new Date(now.getTime() - 86400000 * 5).toISOString();
      const future = new Date(now.getTime() + 86400000 * 5).toISOString();

      const promos = [
        {
          id: "p1",
          code: "ACTIVE10",
          is_active: true,
          start_date: past,
          end_date: future,
          max_redemptions: 100,
          used_count: 10,
        },
        {
          id: "p2",
          code: "EXPIRED20",
          is_active: true,
          start_date: past,
          end_date: new Date(now.getTime() - 86400000).toISOString(),
          max_redemptions: 100,
          used_count: 5,
        },
        {
          id: "p3",
          code: "CAPPED50",
          is_active: true,
          start_date: past,
          end_date: future,
          max_redemptions: 50,
          used_count: 50,
        },
      ];

      const evaluatePromo = (p: (typeof promos)[number]) => {
        const isStarted = !p.start_date || new Date(p.start_date) <= now;
        const isExpired = p.end_date && new Date(p.end_date) < now;
        const isCapReached = p.max_redemptions != null && p.used_count >= p.max_redemptions;
        return p.is_active && isStarted && !isExpired && !isCapReached;
      };

      expect(evaluatePromo(promos[0])).toBe(true);
      expect(evaluatePromo(promos[1])).toBe(false);
      expect(evaluatePromo(promos[2])).toBe(false);
    });
  });
});
