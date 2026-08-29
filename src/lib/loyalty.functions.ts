import { supabase } from "@/integrations/supabase/client";
import type {
  BrandLoyaltyProgram,
  LoyaltyTier,
  LoyaltyAccount,
  LoyaltyLedgerEntry,
} from "./loyalty.types";

/**
 * Pure function to calculate base and tiered loyalty points for an order.
 */
export function calculateOrderLoyaltyPoints({
  subtotal,
  discount = 0,
  tax = 0,
  shipping = 0,
  hasDiscountedItems = false,
  program,
  tierMultiplier = 1.0,
}: {
  subtotal: number;
  discount?: number;
  tax?: number;
  shipping?: number;
  hasDiscountedItems?: boolean;
  program: Partial<BrandLoyaltyProgram>;
  tierMultiplier?: number;
}): {
  eligibleSpend: number;
  basePoints: number;
  multiplier: number;
  finalPoints: number;
} {
  if (!program.is_enabled) {
    return { eligibleSpend: 0, basePoints: 0, multiplier: 1.0, finalPoints: 0 };
  }

  let eligibleSpend = Math.max(0, subtotal - discount);

  if (program.include_tax) {
    eligibleSpend += tax;
  }

  if (program.include_shipping) {
    eligibleSpend += shipping;
  }

  if (hasDiscountedItems && !program.include_discounted_items) {
    eligibleSpend = Math.max(0, eligibleSpend);
  }

  const pointsPerCurrency = program.points_per_currency_unit ?? 10;
  const basePoints = Math.floor(eligibleSpend * pointsPerCurrency);
  const effectiveMultiplier = program.tier_multipliers_enabled ? Math.max(1.0, tierMultiplier) : 1.0;
  const finalPoints = Math.floor(basePoints * effectiveMultiplier);

  return {
    eligibleSpend: Number(eligibleSpend.toFixed(3)),
    basePoints,
    multiplier: effectiveMultiplier,
    finalPoints,
  };
}

/**
 * Pure function to calculate discount value in currency (BHD) from loyalty points.
 */
export function calculatePointsRedemptionDiscount({
  pointsToRedeem,
  redemptionRate = 0.010, // 1 pt = 0.010 BHD -> 100 pts = 1 BHD
  maxAllowedPercentage = 50,
  orderSubtotal,
  minPointsToRedeem = 100,
}: {
  pointsToRedeem: number;
  redemptionRate?: number;
  maxAllowedPercentage?: number;
  orderSubtotal: number;
  minPointsToRedeem?: number;
}): {
  isValid: boolean;
  discountAmount: number;
  errorMessage?: string;
  maxRedeemablePoints: number;
} {
  if (pointsToRedeem <= 0) {
    return { isValid: true, discountAmount: 0, maxRedeemablePoints: 0 };
  }

  if (pointsToRedeem < minPointsToRedeem) {
    return {
      isValid: false,
      discountAmount: 0,
      errorMessage: `Minimum points required is ${minPointsToRedeem}`,
      maxRedeemablePoints: 0,
    };
  }

  const maxAllowedAmount = orderSubtotal * (maxAllowedPercentage / 100);
  const maxRedeemablePoints = Math.floor(maxAllowedAmount / redemptionRate);

  if (pointsToRedeem > maxRedeemablePoints) {
    return {
      isValid: false,
      discountAmount: 0,
      errorMessage: `Maximum points allowed for this order is ${maxRedeemablePoints}`,
      maxRedeemablePoints,
    };
  }

  const discountAmount = Number((pointsToRedeem * redemptionRate).toFixed(3));
  return {
    isValid: true,
    discountAmount,
    maxRedeemablePoints,
  };
}

/**
 * Pure function for pro-rated points reversal during return or cancellation.
 */
export function calculateReturnLoyaltyAdjustment({
  totalOrderSubtotal,
  returnedItemsSubtotal,
  totalPointsEarned,
  totalPointsRedeemed,
}: {
  totalOrderSubtotal: number;
  returnedItemsSubtotal: number;
  totalPointsEarned: number;
  totalPointsRedeemed: number;
}): {
  pointsToRevoke: number;
  pointsToRefund: number;
} {
  if (totalOrderSubtotal <= 0 || returnedItemsSubtotal <= 0) {
    return { pointsToRevoke: 0, pointsToRefund: 0 };
  }

  const returnRatio = Math.min(1.0, returnedItemsSubtotal / totalOrderSubtotal);
  const pointsToRevoke = Math.round(totalPointsEarned * returnRatio);
  const pointsToRefund = Math.round(totalPointsRedeemed * returnRatio);

  return {
    pointsToRevoke,
    pointsToRefund,
  };
}

/**
 * Client RPC Wrapper: Redeem loyalty points at checkout
 */
export async function redeemLoyaltyPoints({
  brandId,
  customerId,
  pointsToRedeem,
  orderSubtotal,
  idempotencyKey,
  orderId,
}: {
  brandId: string;
  customerId: string;
  pointsToRedeem: number;
  orderSubtotal: number;
  idempotencyKey: string;
  orderId?: string;
}) {
  const { data, error } = await (supabase.rpc as any)("rpc_validate_and_redeem_loyalty_points", {
    p_brand_id: brandId,
    p_customer_id: customerId,
    p_points_to_redeem: pointsToRedeem,
    p_order_subtotal: orderSubtotal,
    p_idempotency_key: idempotencyKey,
    p_order_id: orderId ?? null,
  });

  if (error) throw error;
  return data;
}

/**
 * Client RPC Wrapper: Award loyalty points for an order
 */
export async function awardOrderLoyaltyPoints({
  brandId,
  orderId,
  idempotencyKey,
}: {
  brandId: string;
  orderId: string;
  idempotencyKey: string;
}) {
  const { data, error } = await (supabase.rpc as any)("rpc_award_order_loyalty_points", {
    p_brand_id: brandId,
    p_order_id: orderId,
    p_idempotency_key: idempotencyKey,
  });

  if (error) throw error;
  return data;
}
