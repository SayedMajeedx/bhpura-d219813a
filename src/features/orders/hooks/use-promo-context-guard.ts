import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { toast } from "sonner";
import type { Order, OrderItem } from "@/features/orders/types";
import { promoSignature } from "@/features/orders/lib/order-editor";
import { keptDiscount } from "@/features/orders/lib/discount-parts";

type AppliedPromo = { code: string; id: string; amount: number } | null;

/**
 * A promo code was validated for one customer and one set of lines. When either changes the code
 * goes, and only the code: the store's automatic offers and the shopper's points stay on the order.
 */
export function usePromoContextGuard({
  appliedPromo,
  contextRef,
  customerId,
  items,
  lang,
  setAppliedPromo,
  setOrder,
  setPromoInput,
}: {
  appliedPromo: AppliedPromo;
  contextRef: MutableRefObject<string | null>;
  customerId: string | null | undefined;
  items: OrderItem[];
  lang: string;
  setAppliedPromo: Dispatch<SetStateAction<AppliedPromo>>;
  setOrder: Dispatch<SetStateAction<Order | null>>;
  setPromoInput: Dispatch<SetStateAction<string>>;
}) {
  useEffect(() => {
    const signature = promoSignature(customerId, items);
    if (contextRef.current === null) {
      contextRef.current = signature;
      return;
    }
    if (contextRef.current === signature) return;
    contextRef.current = signature;
    if (!appliedPromo) return;
    setAppliedPromo(null);
    setPromoInput("");
    setOrder((current) =>
      current
        ? { ...current, discount: keptDiscount(current), promo_code: null, promo_code_id: null }
        : current,
    );
    toast.info(
      lang === "ar"
        ? "تمت إزالة رمز الخصم بعد تغيير العميل أو المنتجات."
        : "Promo code removed after the customer or items changed.",
    );
  }, [items, customerId, appliedPromo, lang, contextRef, setAppliedPromo, setOrder, setPromoInput]);
}
