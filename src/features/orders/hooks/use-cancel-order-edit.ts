import { useI18n } from "@/lib/i18n";
import type { Order } from "@/features/orders/types";
import type { Dispatch, SetStateAction } from "react";
import type { OrderItem } from "@/features/orders/types";
import type { OrderDetailData } from "@/features/orders/hooks/use-order-detail-data";

/** Cancel editing: after confirming, restore the saved order, lines and promo code and lock the editor. */
export function useCancelOrderEdit({
  initialSnapshotRef,
  isDirty,
  lang,
  orderQ,
  setAppliedPromo,
  setEditingItemSheetIdx,
  setEditingUnlocked,
  setIsEditingFees,
  setItems,
  setOrder,
  setPromoInput,
}: {
  initialSnapshotRef: React.MutableRefObject<{ order: Order; items: OrderItem[] } | null>;
  isDirty: boolean;
  lang: ReturnType<typeof useI18n>["lang"];
  orderQ: OrderDetailData["orderQ"];
  setAppliedPromo: Dispatch<SetStateAction<{ code: string; id: string; amount: number } | null>>;
  setEditingItemSheetIdx: Dispatch<SetStateAction<number | null>>;
  setEditingUnlocked: Dispatch<SetStateAction<boolean>>;
  setIsEditingFees: Dispatch<SetStateAction<boolean>>;
  setItems: Dispatch<SetStateAction<OrderItem[]>>;
  setOrder: Dispatch<SetStateAction<Order | null>>;
  setPromoInput: Dispatch<SetStateAction<string>>;
}) {
  const cancelEditing = () => {
    if (
      isDirty &&
      !window.confirm(
        lang === "ar"
          ? "هل تريد إلغاء التعديل وتجاهل جميع التغييرات غير المحفوظة؟"
          : "Cancel editing and discard all unsaved changes?",
      )
    ) {
      return;
    }

    const snapshot = initialSnapshotRef.current;
    if (snapshot) {
      setOrder((current: any) => ({ ...(current ?? {}), ...snapshot.order }));
      setItems(snapshot.items.map((item) => ({ ...item })));
    }
    const savedPromo = (orderQ.data as any)?.promo_code ?? null;
    setPromoInput(savedPromo ?? "");
    setAppliedPromo(
      savedPromo
        ? {
            code: savedPromo,
            id: (orderQ.data as any)?.promo_code_id ?? "",
            amount: Number((orderQ.data as any)?.discount ?? 0),
          }
        : null,
    );
    setEditingItemSheetIdx(null);
    setIsEditingFees(false);
    setEditingUnlocked(false);
  };

  return {
    cancelEditing,
  };
}
