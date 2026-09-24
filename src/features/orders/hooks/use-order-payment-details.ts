import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { type PaymentBadge } from "@/lib/payment-status";
import { logActivity } from "@/lib/activity-log";
import type { Order } from "@/features/orders/types";
import type { Dispatch, SetStateAction } from "react";
import type { OrderItem } from "@/features/orders/types";
import type { OrderDetailData } from "@/features/orders/hooks/use-order-detail-data";

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
  initialSnapshotRef: React.MutableRefObject<{ order: Order; items: OrderItem[] } | null>;
  order: Order;
  orderQ: OrderDetailData["orderQ"];
  qc: ReturnType<typeof useQueryClient>;
  setOrder: Dispatch<SetStateAction<Order | null>>;
}) {
  const handleSavePaymentDetails = async (updatedFields: {
    payment_status: PaymentBadge;
    payment_method: string;
    advance_paid: number;
    payment_reference?: string;
  }) => {
    if (!order) return;
    const oldStatus = order.payment_status;
    const oldMethod = order.payment_method;
    const oldAdvance = order.advance_paid;

    const finalMethod =
      !updatedFields.payment_method || updatedFields.payment_method === "unspecified"
        ? null
        : updatedFields.payment_method;

    const nextOrder = {
      ...order,
      payment_status: updatedFields.payment_status,
      payment_method: finalMethod,
      advance_paid: updatedFields.advance_paid,
      payment_reference: updatedFields.payment_reference || order.payment_reference,
    };
    setOrder(nextOrder);

    // If order is saved in DB, persist change immediately
    if (order.id && !order.id.startsWith("draft_")) {
      const { error } = await supabase
        .from("orders")
        .update({
          payment_status: updatedFields.payment_status,
          payment_method: finalMethod,
          advance_paid: updatedFields.advance_paid,
          payment_reference: updatedFields.payment_reference || order.payment_reference,
        } as any)
        .eq("id", order.id);

      if (error) {
        setOrder({ ...order });
        throw error;
      }

      // Keep initialSnapshot in sync so isDirty is computed accurately
      if (initialSnapshotRef.current) {
        initialSnapshotRef.current = {
          ...initialSnapshotRef.current,
          order: {
            ...initialSnapshotRef.current.order,
            payment_status: updatedFields.payment_status,
            payment_method: finalMethod,
            advance_paid: updatedFields.advance_paid,
            payment_reference: updatedFields.payment_reference || order.payment_reference,
          },
        };
      }

      // Log Activity Entry
      await logActivity({
        action: "payment_update",
        order_id: order.id,
        en: `Updated payment status to ${updatedFields.payment_status.toUpperCase()} (${(finalMethod || "unspecified").toUpperCase()}), Advance: BHD ${updatedFields.advance_paid.toFixed(3)}`,
        ar: `تحديث حالة الدفع إلى ${updatedFields.payment_status} (${finalMethod || "غير محدد"})، المبلغ المستلم: ${updatedFields.advance_paid.toFixed(3)} د.ب`,
        metadata: {
          oldStatus,
          oldMethod,
          oldAdvance,
          ...updatedFields,
          payment_method: finalMethod,
        },
      });

      qc.invalidateQueries({ queryKey: ["activity_logs"] });
      qc.invalidateQueries({ queryKey: ["order", order.id] });
      qc.invalidateQueries({ queryKey: ["orders", brandId] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      await orderQ.refetch();
    }
  };

  return {
    handleSavePaymentDetails,
  };
}
