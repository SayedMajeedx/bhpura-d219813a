import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { getFriendlyErrorMessage } from "@/lib/utils";
import { logActivity } from "@/lib/activity-log";
import { getFulfillmentLabel } from "@/lib/status-labels";
import type { Order } from "@/features/orders/types";
import type { QueryClient } from "@tanstack/react-query";
import type { OrderDetailData } from "@/features/orders/hooks/use-order-detail-data";
import { invalidateOrders, updateOrder, type OrderPatch } from "@/lib/data/orders";
import { invalidateActivityLogs } from "@/lib/data/activity-logs";
import { isSavedOrderId } from "@/features/orders/lib/order-editor";
import type { Dispatch, SetStateAction } from "react";

/**
 * Sets the order's status and fulfillment status directly (from the status
 * menu), stamps delivered_at on completion, and logs it. Rethrows on failure
 * so the caller can keep its menu open. A new, unsaved order takes the
 * status in the editor and saves it with the order.
 */
export function createOrderStatusChange({
  order,
  lang,
  orderQ,
  qc,
  brandId,
  setOrder,
}: {
  order: Order | null;
  lang: ReturnType<typeof useI18n>["lang"];
  orderQ: OrderDetailData["orderQ"];
  qc: QueryClient;
  brandId: string;
  setOrder: Dispatch<SetStateAction<Order | null>>;
}) {
  return async (newStatus: string, newFulfillmentStatus: string) => {
    if (!order) return;
    try {
      const updatePayload: OrderPatch = {
        status: newStatus,
        fulfillment_status: newFulfillmentStatus,
        updated_at: new Date().toISOString(),
      };
      if (newStatus === "completed") {
        updatePayload.delivered_at = new Date().toISOString();
      }

      if (!isSavedOrderId(order.id)) {
        setOrder((current) =>
          current
            ? { ...current, status: newStatus, fulfillment_status: newFulfillmentStatus }
            : current,
        );
        toast.success(
          lang === "ar"
            ? "سيتم حفظ الحالة مع الطلب عند حفظه"
            : "The status will be saved with the order",
        );
        return;
      }

      await updateOrder(brandId, order.id, updatePayload);

      const labelAr = getFulfillmentLabel(newFulfillmentStatus, "ar");
      const labelEn = getFulfillmentLabel(newFulfillmentStatus, "en");

      toast.success(
        lang === "ar"
          ? `تم تحديث حالة الطلب إلى "${labelAr}"`
          : `Updated order status to "${labelEn}"`,
      );

      await logActivity({
        action: "status_change",
        order_id: order.id,
        en: `Updated order status to "${labelEn}"`,
        ar: `تحديث حالة الطلب إلى "${labelAr}"`,
      });

      await orderQ.refetch();
      invalidateOrders(qc, brandId);
      invalidateActivityLogs(qc);
    } catch (err: unknown) {
      toast.error(
        getFriendlyErrorMessage(err) ||
          (lang === "ar" ? "تعذر تحديث حالة الطلب" : "Unable to update order status"),
      );
      throw err;
    }
  };
}
