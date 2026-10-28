import { useQueryClient } from "@tanstack/react-query";
import { logActivity } from "@/lib/activity-log";
import type { Order, OrderSnapshot } from "@/features/orders/types";
import type { Dispatch, SetStateAction } from "react";
import type { OrderDetailData } from "@/features/orders/hooks/use-order-detail-data";
import { orderPaymentUpdate, type PaymentDetailsInput } from "@/features/orders/lib/order-payment";
import { invalidateOrders, updateOrder } from "@/lib/data/orders";
import { invalidateActivityLogs } from "@/lib/data/activity-logs";
import { isSavedOrderId } from "@/features/orders/lib/order-editor";
import { formatMoney } from "@/lib/format";

/** Saving payment status, method, advance and reference from the payment modal; saved orders persist and log it immediately. */
export function useOrderPaymentDetails({
  brandId,
  initialSnapshotRef,
  order,
  orderQ,
  qc,
  setOrder,
}: {
  brandId: string;
  initialSnapshotRef: React.MutableRefObject<OrderSnapshot | null>;
  order: Order | null;
  orderQ: OrderDetailData["orderQ"];
  qc: ReturnType<typeof useQueryClient>;
  setOrder: Dispatch<SetStateAction<Order | null>>;
}) {
  const handleSavePaymentDetails = async (updatedFields: PaymentDetailsInput) => {
    if (!order) return;
    const oldStatus = order.payment_status;
    const oldMethod = order.payment_method;
    const oldAdvance = order.advance_paid;
    // The log says the amount in the order's own currency, never a fixed one.
    const currency = order.currency || "BHD";

    const paymentFields = orderPaymentUpdate(updatedFields, order.payment_reference);
    const finalMethod = paymentFields.payment_method;

    const nextOrder = { ...order, ...paymentFields };
    setOrder(nextOrder);

    // A saved order persists the change now; a new one keeps it in the editor
    // and saves it with the order.
    if (isSavedOrderId(order.id)) {
      try {
        await updateOrder(brandId, order.id, paymentFields);
      } catch (error) {
        setOrder({ ...order });
        throw error;
      }

      // Keep initialSnapshot in sync so isDirty is computed accurately
      if (initialSnapshotRef.current) {
        initialSnapshotRef.current = {
          ...initialSnapshotRef.current,
          order: {
            ...initialSnapshotRef.current.order,
            ...paymentFields,
          },
        };
      }

      // Log Activity Entry
      await logActivity({
        action: "payment_update",
        order_id: order.id,
        en: `Updated payment status to ${updatedFields.payment_status.toUpperCase()} (${(finalMethod || "unspecified").toUpperCase()}), Advance: ${formatMoney(updatedFields.advance_paid, currency, "en")}`,
        ar: `تحديث حالة الدفع إلى ${updatedFields.payment_status} (${finalMethod || "غير محدد"})، المبلغ المستلم: ${formatMoney(updatedFields.advance_paid, currency, "ar")}`,
        metadata: {
          oldStatus,
          oldMethod,
          oldAdvance,
          ...updatedFields,
          payment_method: finalMethod,
        },
      });

      invalidateActivityLogs(qc);
      invalidateOrders(qc, brandId);
      await orderQ.refetch();
    }
  };

  return {
    handleSavePaymentDetails,
  };
}
