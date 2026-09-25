import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useBrand } from "@/lib/brand-context";
import type { Order } from "@/features/orders/types";
import { orderTotals, promoFailureMessage } from "@/features/orders/lib/order-editor";
import type { Dispatch, SetStateAction } from "react";
import type { OrderItem } from "@/features/orders/types";

/** Applying a promo code (validated by validate_promo_code for this customer and these lines) and removing it. */
export function useOrderPromoCode({
  brand,
  items,
  lang,
  order,
  promoInput,
  setAppliedPromo,
  setCheckingPromo,
  setOrder,
  setPromoInput,
  totals,
}: {
  brand: ReturnType<typeof useBrand>;
  items: OrderItem[];
  lang: ReturnType<typeof useI18n>["lang"];
  order: Order | null;
  promoInput: string;
  setAppliedPromo: Dispatch<SetStateAction<{ code: string; id: string; amount: number } | null>>;
  setCheckingPromo: Dispatch<SetStateAction<boolean>>;
  setOrder: Dispatch<SetStateAction<Order | null>>;
  setPromoInput: Dispatch<SetStateAction<string>>;
  totals: ReturnType<typeof orderTotals>;
}) {
  const applyAdminPromo = async () => {
    if (!order) return;
    const code = promoInput.trim().toUpperCase();
    if (!code) return toast.error(lang === "ar" ? "أدخل رمز الخصم." : "Enter a promo code.");
    if (!items.length || totals.subtotal <= 0)
      return toast.error(
        lang === "ar" ? "أضف منتجات إلى الطلب أولاً." : "Add products to the order first.",
      );
    setCheckingPromo(true);
    const { data, error } = await supabase.rpc("validate_promo_code" as any, {
      p_brand_slug: brand.slug,
      p_code: code,
      p_subtotal: totals.subtotal,
      p_items: items.map((item) => ({
        variant_id: item.variant_id,
        line_total: Number(item.line_total.toFixed(3)),
      })),
      p_customer_id: order.customer_id ?? null,
    });
    setCheckingPromo(false);
    if (error)
      return toast.error(
        error.message ||
          (lang === "ar" ? "تعذر التحقق من الرمز." : "Could not validate this promo code."),
      );
    const result = data as any;
    if (!result?.valid) return toast.error(promoFailureMessage(result, lang));
    const amount = Number(result.discount_amount ?? 0);
    const active = { code: String(result.code), id: String(result.promo_code_id), amount };
    setPromoInput(active.code);
    setAppliedPromo(active);
    setOrder({ ...order, discount: amount, promo_code: active.code, promo_code_id: active.id });
    toast.success(lang === "ar" ? "تم تطبيق رمز الخصم." : "Promo code applied.");
  };
  const removeAdminPromo = () => {
    if (!order) return;
    setAppliedPromo(null);
    setPromoInput("");
    setOrder({ ...order, discount: 0, promo_code: null, promo_code_id: null });
  };

  return {
    applyAdminPromo,
    removeAdminPromo,
  };
}
