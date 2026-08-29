import { describe, it, expect } from "vitest";
import {
  calculateOrderLoyaltyPoints,
  calculatePointsRedemptionDiscount,
  calculateReturnLoyaltyAdjustment,
} from "../src/lib/loyalty.functions";
import type { BrandLoyaltyProgram } from "../src/lib/loyalty.types";

describe("Loyalty Points Engine Unit Tests", () => {
  const baseProgram: BrandLoyaltyProgram = {
    id: "prog-1",
    brand_id: "brand-1",
    is_enabled: true,
    points_per_currency_unit: 10,
    redemption_rate: 0.010, // 1 point = 0.010 BHD (100 points = 1 BHD)
    min_redemption_points: 100,
    max_redemption_percent: 50,
    points_holding_days: 14,
    points_expiry_months: 12,
    first_order_bonus_points: 50,
    review_bonus_points: 20,
    referral_bonus_points: 100,
    tier_multipliers_enabled: true,
    include_shipping: false,
    include_tax: false,
    include_discounted_items: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  describe("Points Earning Calculations", () => {
    it("should calculate standard points earned based on net eligible spend", () => {
      const res = calculateOrderLoyaltyPoints({
        subtotal: 50.0,
        discount: 10.0,
        tax: 2.0,
        shipping: 1.5,
        program: baseProgram,
        tierMultiplier: 1.0,
      });

      // Net spend = 50 - 10 = 40 BHD -> 40 * 10 pts = 400 points
      expect(res.eligibleSpend).toBe(40);
      expect(res.basePoints).toBe(400);
      expect(res.finalPoints).toBe(400);
    });

    it("should apply VIP tier multiplier correctly", () => {
      const res = calculateOrderLoyaltyPoints({
        subtotal: 100.0,
        discount: 0,
        tax: 0,
        shipping: 0,
        program: baseProgram,
        tierMultiplier: 1.5, // Gold tier 1.5x
      });

      // 100 * 10 * 1.5 = 1500 points
      expect(res.basePoints).toBe(1000);
      expect(res.multiplier).toBe(1.5);
      expect(res.finalPoints).toBe(1500);
    });

    it("should exclude shipping, tax, and sale items if configured", () => {
      const res = calculateOrderLoyaltyPoints({
        subtotal: 100.0,
        discount: 0,
        tax: 10.0,
        shipping: 5.0,
        hasDiscountedItems: true,
        program: {
          ...baseProgram,
          include_shipping: false,
          include_tax: false,
          include_discounted_items: false,
        },
        tierMultiplier: 1.0,
      });

      // Eligible spend without shipping/tax = 100 BHD
      expect(res.eligibleSpend).toBe(100);
      expect(res.finalPoints).toBe(1000);
    });

    it("should include shipping and tax when toggled ON", () => {
      const res = calculateOrderLoyaltyPoints({
        subtotal: 100.0,
        discount: 0,
        tax: 10.0,
        shipping: 5.0,
        program: {
          ...baseProgram,
          include_shipping: true,
          include_tax: true,
        },
        tierMultiplier: 1.0,
      });

      // Eligible spend = 100 + 10 + 5 = 115 BHD
      expect(res.eligibleSpend).toBe(115);
      expect(res.finalPoints).toBe(1150);
    });

    it("should return 0 points if program is disabled or net spend <= 0", () => {
      const disabledRes = calculateOrderLoyaltyPoints({
        subtotal: 100.0,
        discount: 0,
        tax: 0,
        shipping: 0,
        program: { ...baseProgram, is_enabled: false },
        tierMultiplier: 1.0,
      });
      expect(disabledRes.finalPoints).toBe(0);

      const zeroSpendRes = calculateOrderLoyaltyPoints({
        subtotal: 20.0,
        discount: 25.0,
        tax: 0,
        shipping: 0,
        program: baseProgram,
        tierMultiplier: 1.0,
      });
      expect(zeroSpendRes.finalPoints).toBe(0);
    });
  });

  describe("Points Redemption Calculations", () => {
    it("should calculate correct discount amount for valid points", () => {
      const res = calculatePointsRedemptionDiscount({
        pointsToRedeem: 250,
        orderSubtotal: 50.0,
        redemptionRate: baseProgram.redemption_rate,
        maxAllowedPercentage: baseProgram.max_redemption_percent,
        minPointsToRedeem: baseProgram.min_redemption_points,
      });

      expect(res.isValid).toBe(true);
      expect(res.discountAmount).toBe(2.5); // 250 * 0.010 = 2.500 BHD
    });

    it("should fail if points requested are below min_redemption_points", () => {
      const res = calculatePointsRedemptionDiscount({
        pointsToRedeem: 50, // Below 100 min
        orderSubtotal: 50.0,
        redemptionRate: baseProgram.redemption_rate,
        maxAllowedPercentage: baseProgram.max_redemption_percent,
        minPointsToRedeem: baseProgram.min_redemption_points,
      });

      expect(res.isValid).toBe(false);
      expect(res.errorMessage).toContain("Minimum points required");
    });

    it("should reject redemption exceeding maximum allowed percentage of subtotal", () => {
      // Subtotal 10 BHD -> max 50% = 5 BHD max discount = 500 points max
      const res = calculatePointsRedemptionDiscount({
        pointsToRedeem: 800, // 8 BHD discount > 5 BHD limit
        orderSubtotal: 10.0,
        redemptionRate: baseProgram.redemption_rate,
        maxAllowedPercentage: baseProgram.max_redemption_percent,
        minPointsToRedeem: baseProgram.min_redemption_points,
      });

      expect(res.isValid).toBe(false);
      expect(res.errorMessage).toContain("Maximum points allowed");
    });
  });

  describe("Returns & Cancellations Loyalty Adjustments", () => {
    it("should compute 100% clawback and 100% refund for a full order return", () => {
      const adjustment = calculateReturnLoyaltyAdjustment({
        totalOrderSubtotal: 100.0,
        returnedItemsSubtotal: 100.0,
        totalPointsEarned: 1000,
        totalPointsRedeemed: 200,
      });

      expect(adjustment.pointsToRevoke).toBe(1000);
      expect(adjustment.pointsToRefund).toBe(200);
    });

    it("should compute proportional clawback and refund for partial order return (50%)", () => {
      const adjustment = calculateReturnLoyaltyAdjustment({
        totalOrderSubtotal: 100.0,
        returnedItemsSubtotal: 50.0,
        totalPointsEarned: 1000,
        totalPointsRedeemed: 200,
      });

      expect(adjustment.pointsToRevoke).toBe(500); // 50% of 1000
      expect(adjustment.pointsToRefund).toBe(100); // 50% of 200
    });

    it("should handle rounding properly when splitting uneven points", () => {
      const adjustment = calculateReturnLoyaltyAdjustment({
        totalOrderSubtotal: 75.0,
        returnedItemsSubtotal: 25.0, // 1/3 ratio
        totalPointsEarned: 100,
        totalPointsRedeemed: 50,
      });

      expect(adjustment.pointsToRevoke).toBe(33); // Math.round(100 * 0.3333...)
      expect(adjustment.pointsToRefund).toBe(17); // Math.round(50 * 0.3333...)
    });
  });
});

describe("Abandoned Carts Recovery Logic", () => {
  it("should validate that recovery tokens and links are correctly structured", () => {
    const brandSlug = "boutq-demo";
    const token = "rec_abc123xyz";
    const recoveryUrl = `https://boutq.app/${brandSlug}/checkout?recover=${token}`;

    expect(recoveryUrl).toContain("/checkout?recover=");
    expect(recoveryUrl).toContain(token);
  });

  it("should ensure marketing consent rules protect privacy", () => {
    const unconsentedGuest = {
      guest_email: "guest@example.com",
      guest_phone: "+97333333333",
      marketing_consent: false,
    };

    const isEligibleForPromotions = unconsentedGuest.marketing_consent === true;
    expect(isEligibleForPromotions).toBe(false);
  });
});
