import { useEffect, useState } from "react";
import { toast } from "sonner";
import { validatePromoCode, type PromoValidation } from "@/lib/data/promo-codes";
import type { AppliedPromo, Storefront } from "@/features/checkout/types";
import { promoRejectionMessage } from "@/features/checkout/lib/promo-rejection";

/**
 * The promo code box: validates the code against the cart on the server and
 * drops an applied code whenever the cart changes.
 */
export function usePromoCode({
  brand,
  cart,
  cartTotal,
  currency,
  lang,
  t,
}: {
  brand: Pick<Storefront["brand"], "id" | "slug">;
  cart: Storefront["cart"];
  cartTotal: number;
  currency: string;
  lang: Storefront["lang"];
  t: Storefront["t"];
}) {
  const [promoInput, setPromoInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<AppliedPromo | null>(null);
  const [checkingPromo, setCheckingPromo] = useState(false);

  useEffect(() => {
    setAppliedPromo(null);
  }, [cart, brand.id]);

  const applyPromo = async () => {
    const code = promoInput.trim().toUpperCase();
    if (!code) return toast.error(t("أدخل رمز الخصم", "Enter a promo code"));
    setCheckingPromo(true);
    const promoItems = cart.map((item) => ({
      variant_id: item.variant_id && item.variant_id.trim() ? item.variant_id : null,
      line_total: Number((item.price * item.qty).toFixed(3)),
    }));
    let result: PromoValidation | null;
    try {
      result = await validatePromoCode({
        brandSlug: brand.slug,
        code,
        subtotal: cartTotal,
        items: promoItems,
      });
    } catch {
      return toast.error(t("تعذر التحقق من الرمز", "Could not validate this code"));
    } finally {
      setCheckingPromo(false);
    }
    if (!result?.valid) {
      setAppliedPromo(null);
      return toast.error(promoRejectionMessage(result, { currency, lang, t }));
    }
    setAppliedPromo({ code: result.code, amount: Number(result.discount_amount) });
    setPromoInput(result.code);
    toast.success(t("تم تطبيق الخصم", "Promo code applied"));
  };

  return {
    promoInput,
    setPromoInput,
    appliedPromo,
    setAppliedPromo,
    checkingPromo,
    applyPromo,
  };
}
