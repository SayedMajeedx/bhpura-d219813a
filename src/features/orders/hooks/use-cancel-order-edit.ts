import { useI18n } from "@/lib/i18n";
import type { Order, OrderSnapshot } from "@/features/orders/types";
import type { Dispatch, SetStateAction } from "react";
import type { OrderItem } from "@/features/orders/types";
import type { OrderDetailData } from "@/features/orders/hooks/use-order-detail-data";
import { confirmDialog } from "@/components/ui/confirm-dialog";

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
  initialSnapshotRef: React.MutableRefObject<OrderSnapshot | null>;
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
  const cancelEditing = async () => {
    if (
      isDirty &&
      !(await confirmDialog({
        title: lang === "ar" ? "إلغاء التعديل؟" : "Cancel editing?",
        description:
          lang === "ar"
            ? "ستضيع التغييرات غير المحفوظة في هذا الطلب."
            : "The order's unsaved changes will be lost.",
        confirmLabel: lang === "ar" ? "تجاهل التغييرات" : "Discard changes",
        destructive: true,
      }))
    ) {
      return;
    }

    const snapshot = initialSnapshotRef.current;
    if (snapshot) {
      setOrder((current: any) => ({ ...(current ?? {}), ...snapshot.order }));
      setItems(snapshot.items.map((item) => ({ ...item })));
    }
    const savedPromo = orderQ.data?.promo_code ?? null;
    setPromoInput(savedPromo ?? "");
    setAppliedPromo(
      savedPromo
        ? {
            code: savedPromo,
            id: orderQ.data?.promo_code_id ?? "",
            amount: Number(orderQ.data?.discount ?? 0),
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
