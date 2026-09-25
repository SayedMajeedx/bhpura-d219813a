import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import {
  courierCompleteDelivery,
  invalidateOrders,
  ordersKeys,
  updateOrder,
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
    order: Pick<
      OrderListRow,
      "id" | "total" | "advance_paid" | "payment_status" | "delivery_notes"
    >,
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
      // 1. Try atomic RPC first
      const rpcErr = await courierCompleteDelivery(order.id, amountToCollect, notes || null);

      if (rpcErr) {
        // 2. Direct table update fallback if RPC function missing or column schema mismatch
        const currentPaid = Number(order.advance_paid ?? 0);
        const newPaid = currentPaid + amountToCollect;
        const total = Number(order.total || 0);
        const newStatus =
          newPaid >= total
            ? "paid"
            : newPaid > 0
              ? "partially_paid"
              : order.payment_status || "unpaid";

        let updatedNotes = order.delivery_notes || "";
        if (notes && notes.trim()) {
          const timestamp = new Date().toISOString().slice(0, 16).replace("T", " ");
          updatedNotes = updatedNotes
            ? `${updatedNotes}\n[${timestamp}]: ${notes.trim()}`
            : notes.trim();
        }

        await updateOrder(brandId, order.id, {
          advance_paid: newPaid,
          cod_collected_amount: amountToCollect,
          cod_collected_at: new Date().toISOString(),
          payment_status: newStatus,
          fulfillment_status: "COMPLETED",
          status: "completed",
          delivery_notes: updatedNotes || null,
          delivered_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }

      toast.success(
        lang === "ar"
          ? "تم تسجيل تسليم الطلب وتأكيد التحصيل بنجاح!"
          : "Delivery completed and payment confirmed!",
      );
      setCashModalOrder(null);
      setCashCollectedAmount("");
      setCashModalNotes("");
      invalidateOrders(qc, brandId);
    } catch (err: any) {
      qc.setQueryData(ordersQueryKey, previousOrders);
      toast.error(err.message || "Failed to complete delivery");
    } finally {
      setUpdatingOrderId(null);
      setIsSubmittingCash(false);
    }
  };

  return {
    handleCompleteDelivery,
  };
}
