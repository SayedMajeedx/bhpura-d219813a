import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { getFriendlyErrorMessage } from "@/lib/utils";
import {
  courierCompleteDelivery,
  invalidateOrders,
  ordersKeys,
  type OrderListRow,
} from "@/lib/data/orders";

import type { Dispatch, SetStateAction } from "react";

/** Courier hands over a cash-on-delivery or prepaid order: records the cash collected, completes the delivery and refreshes the list. */
export function useCompleteDelivery({
  brandId,
  isCourier,
  lang,
  qc,
  setCashCollectedAmount,
  setCashModalNotes,
  setCashModalOrder,
  setIsSubmittingCash,
  setUpdatingOrderId,
}: {
  brandId: string;
  isCourier: boolean;
  lang: ReturnType<typeof useI18n>["lang"];
  qc: ReturnType<typeof useQueryClient>;
  setCashCollectedAmount: Dispatch<SetStateAction<string>>;
  setCashModalNotes: Dispatch<SetStateAction<string>>;
  setCashModalOrder: Dispatch<SetStateAction<any | null>>;
  setIsSubmittingCash: Dispatch<SetStateAction<boolean>>;
  setUpdatingOrderId: Dispatch<SetStateAction<string | null>>;
}) {
  const handleCompleteDelivery = async (
    order: Pick<OrderListRow, "id">,
    amountToCollect: number,
    notes?: string,
  ) => {
    if (amountToCollect < 0) {
      toast.error(
        lang === "ar"
          ? "لا يمكن أن يكون المبلغ المحصل بالسالب"
          : "Collected amount cannot be negative",
      );
      return;
    }
    const ordersQueryKey = ordersKeys.list(brandId, isCourier ? "assigned-courier" : "office");
    const previousOrders = qc.getQueryData<OrderListRow[]>(ordersQueryKey);
    setUpdatingOrderId(order.id);
    setIsSubmittingCash(true);
    qc.setQueryData<OrderListRow[]>(ordersQueryKey, (current) =>
      current?.map((item) =>
        item.id === order.id
          ? {
              ...item,
              status: "completed",
              fulfillment_status: "COMPLETED",
              delivered_at: new Date().toISOString(),
            }
          : item,
      ),
    );
    try {
      // The server alone completes it (assigned courier or the brand's staff),
      // so a refusal is shown instead of a browser write that RLS drops (bug #14).
      const error = await courierCompleteDelivery(order.id, amountToCollect, notes || null);
      if (error) throw error;

      toast.success(
        lang === "ar"
          ? "تم تسجيل تسليم الطلب وتأكيد التحصيل بنجاح!"
          : "Delivery completed and payment confirmed!",
      );
      setCashModalOrder(null);
      setCashCollectedAmount("");
      setCashModalNotes("");
      invalidateOrders(qc, brandId);
    } catch (err) {
      qc.setQueryData(ordersQueryKey, previousOrders);
      toast.error(
        String((err as { message?: string })?.message ?? "").includes("DELIVERY_ALREADY_COMPLETED")
          ? lang === "ar"
            ? "تم تسليم هذا الطلب مسبقاً"
            : "This delivery was already completed"
          : getFriendlyErrorMessage(err) ||
              (lang === "ar" ? "تعذر إتمام التسليم" : "Failed to complete delivery"),
      );
    } finally {
      setUpdatingOrderId(null);
      setIsSubmittingCash(false);
    }
  };

  return {
    handleCompleteDelivery,
  };
}
