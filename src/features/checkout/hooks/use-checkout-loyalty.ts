import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { calculateOrderLoyaltyPoints } from "@/lib/loyalty.functions";
import type { BrandLoyaltyProgram, LoyaltyAccount, LoyaltyTier } from "@/lib/loyalty.types";
import type { Storefront } from "@/features/checkout/types";

/**
 * Loyalty at checkout: the brand's program and the customer's points and tier,
 * redeeming points (within the minimum and the program's cap on the cart),
 * the points discount, and the points this order will earn.
 */
export function useCheckoutLoyalty({
  brand,
  customerId,
  cartTotal,
  promoDiscount,
  currency,
  lang,
}: {
  brand: Pick<Storefront["brand"], "id">;
  customerId: string | null;
  cartTotal: number;
  promoDiscount: number;
  currency: string;
  lang: Storefront["lang"];
}) {
  const [loyaltyAccount, setLoyaltyAccount] = useState<LoyaltyAccount | null>(null);
  const [loyaltyProgram, setLoyaltyProgram] = useState<BrandLoyaltyProgram | null>(null);
  const [loyaltyTier, setLoyaltyTier] = useState<LoyaltyTier | null>(null);
  const [pointsToRedeemInput, setPointsToRedeemInput] = useState<string>("");
  const [redeemedPoints, setRedeemedPoints] = useState<number>(0);

  // 1. Fetch Loyalty Program and Customer Account
  useEffect(() => {
    (async () => {
      try {
        const { data: prog } = await (supabase as any)
          .from("brand_loyalty_programs")
          .select("*")
          .eq("brand_id", brand.id)
          .maybeSingle();
        if (prog) setLoyaltyProgram(prog);

        if (customerId) {
          const { data: acc } = await (supabase as any)
            .from("loyalty_accounts")
            .select("*")
            .eq("brand_id", brand.id)
            .eq("customer_id", customerId)
            .maybeSingle();
          if (acc) {
            setLoyaltyAccount(acc);
            const { data: tier } = await (supabase as any)
              .from("brand_loyalty_tiers")
              .select("*")
              .eq("brand_id", brand.id)
              .eq("tier_key", acc.current_tier_key)
              .maybeSingle();
            if (tier) setLoyaltyTier(tier);
          }
        }
      } catch (e) {
        console.error("Loyalty program fetch failed", e);
      }
    })();
  }, [brand.id, customerId]);

  const maxRedemptionPercent =
    loyaltyProgram?.max_redemption_percentage ?? loyaltyProgram?.max_redemption_percent ?? 50;
  const redemptionRate = Number(loyaltyProgram?.redemption_rate || 0.01);

  const maxAllowedLoyaltyDiscount = useMemo(() => {
    return Math.max(0, (cartTotal * maxRedemptionPercent) / 100);
  }, [cartTotal, maxRedemptionPercent]);

  const maxRedeemablePoints = useMemo(() => {
    if (!loyaltyProgram?.is_enabled || redemptionRate <= 0) return 0;
    const maxByCart = Math.floor(maxAllowedLoyaltyDiscount / redemptionRate);
    const maxByAccount = loyaltyAccount?.active_points || 0;
    return Math.max(0, Math.min(maxByCart, maxByAccount));
  }, [loyaltyProgram, redemptionRate, maxAllowedLoyaltyDiscount, loyaltyAccount]);

  const effectiveRedeemedPoints = useMemo(() => {
    if (!loyaltyProgram?.is_enabled || redeemedPoints <= 0) return 0;
    const minRedemption =
      loyaltyProgram?.min_points_to_redeem ?? loyaltyProgram?.min_redemption_points ?? 100;
    if (redeemedPoints < minRedemption) return 0;
    return Math.min(redeemedPoints, maxRedeemablePoints);
  }, [loyaltyProgram, redeemedPoints, maxRedeemablePoints]);

  const loyaltyDiscount = useMemo(() => {
    if (!loyaltyProgram?.is_enabled || effectiveRedeemedPoints <= 0) return 0;
    const rawDisc = Number((effectiveRedeemedPoints * redemptionRate).toFixed(3));
    const maxApplicable = Math.max(
      0,
      Math.min(maxAllowedLoyaltyDiscount, cartTotal - promoDiscount),
    );
    return Number(Math.min(rawDisc, maxApplicable).toFixed(3));
  }, [
    loyaltyProgram,
    effectiveRedeemedPoints,
    redemptionRate,
    maxAllowedLoyaltyDiscount,
    cartTotal,
    promoDiscount,
  ]);

  useEffect(() => {
    if (!redeemedPoints || !loyaltyProgram?.is_enabled) return;
    const minRedemption =
      loyaltyProgram?.min_points_to_redeem ?? loyaltyProgram?.min_redemption_points ?? 100;
    if (maxRedeemablePoints < minRedemption || cartTotal <= 0) {
      setRedeemedPoints(0);
      setPointsToRedeemInput("");
      toast.info(
        lang === "ar"
          ? "تم إلغاء خصم نقاط المكافآت لتغير إجمالي السلة عن الحد الأدنى"
          : "Loyalty points discount removed as cart total fell below redemption threshold",
      );
    } else if (redeemedPoints > maxRedeemablePoints) {
      setRedeemedPoints(maxRedeemablePoints);
      setPointsToRedeemInput(String(maxRedeemablePoints));
      toast.info(
        lang === "ar"
          ? `تم تحديث خصم النقاط تلقائياً ليلائم السلة الجديدة (${maxRedeemablePoints} نقطة)`
          : `Loyalty points adjusted to fit new cart subtotal (${maxRedeemablePoints} pts)`,
      );
    }
  }, [cartTotal, maxRedeemablePoints, loyaltyProgram, lang, redeemedPoints]);

  const estimatedPointsToEarn = useMemo(() => {
    if (!loyaltyProgram?.is_enabled) return 0;
    const res = calculateOrderLoyaltyPoints({
      subtotal: cartTotal,
      discount: promoDiscount + loyaltyDiscount,
      tax: 0,
      shipping: 0,
      program: loyaltyProgram,
      tierMultiplier: loyaltyTier?.points_multiplier || 1.0,
    });
    return res.finalPoints;
  }, [loyaltyProgram, cartTotal, promoDiscount, loyaltyDiscount, loyaltyTier]);

  const handleApplyPoints = () => {
    const pts = parseInt(pointsToRedeemInput, 10);
    if (isNaN(pts) || pts <= 0) {
      setRedeemedPoints(0);
      return toast.error(lang === "ar" ? "أدخل عدد نقاط صحيح" : "Enter a valid points amount");
    }
    const maxAvailable = loyaltyAccount?.active_points || 0;
    if (pts > maxAvailable) {
      return toast.error(
        lang === "ar"
          ? `رصيد نقاطك المتاح هو ${maxAvailable} نقطة فقط`
          : `You only have ${maxAvailable} points available`,
      );
    }
    const minRedemption =
      loyaltyProgram?.min_points_to_redeem ?? loyaltyProgram?.min_redemption_points ?? 100;
    if (pts < minRedemption) {
      return toast.error(
        lang === "ar"
          ? `الحد الأدنى لاستخدام النقاط هو ${minRedemption} نقطة`
          : `Minimum points to redeem is ${minRedemption}`,
      );
    }
    const maxPercent =
      loyaltyProgram?.max_redemption_percentage ?? loyaltyProgram?.max_redemption_percent ?? 50;
    const maxDiscountAllowed = (cartTotal * maxPercent) / 100;
    const calculatedDisc = pts * Number(loyaltyProgram?.redemption_rate || 0.01);
    if (calculatedDisc > maxDiscountAllowed) {
      const allowedPts = Math.floor(
        maxDiscountAllowed / Number(loyaltyProgram?.redemption_rate || 0.01),
      );
      return toast.error(
        lang === "ar"
          ? `أقصى خصم مسموح بالنقاط لهذا الطلب هو ${allowedPts} نقطة (${maxDiscountAllowed.toFixed(3)} ${currency})`
          : `Max points allowed for this order is ${allowedPts} (${maxDiscountAllowed.toFixed(3)} ${currency})`,
      );
    }
    setRedeemedPoints(pts);
    toast.success(
      lang === "ar"
        ? `تم تطبيق خصم النقاط (${calculatedDisc.toFixed(3)} ${currency})`
        : `Points discount applied (${calculatedDisc.toFixed(3)} ${currency})`,
    );
  };

  const handleRemovePoints = () => {
    setRedeemedPoints(0);
    setPointsToRedeemInput("");
    toast.info(lang === "ar" ? "تم إزالة خصم النقاط" : "Points discount removed");
  };

  return {
    loyaltyAccount,
    loyaltyProgram,
    pointsToRedeemInput,
    setPointsToRedeemInput,
    redeemedPoints,
    effectiveRedeemedPoints,
    loyaltyDiscount,
    estimatedPointsToEarn,
    handleApplyPoints,
    handleRemovePoints,
  };
}
