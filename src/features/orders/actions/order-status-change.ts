import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { getFriendlyErrorMessage } from "@/lib/utils";
import { logActivity } from "@/lib/activity-log";
import { getFulfillmentLabel } from "@/lib/status-labels";
import type { Order } from "@/features/orders/types";
import type { QueryClient } from "@tanstack/react-query";
import type { OrderDetailData } from "@/features/orders/hooks/use-order-detail-data";

/**
 * Sets the order's status and fulfillment status directly (from the status
 * menu), stamps delivered_at on completion, and logs it. Rethrows on failure
 * so the caller can keep its menu open.
 */
export function createOrderStatusChange({
  order,
  lang,
  orderQ,
  qc,
  brandId,
}: {
  order: Order | null;
  lang: ReturnType<typeof useI18n>["lang"];
  orderQ: OrderDetailData["orderQ"];
  qc: QueryClient;
  brandId: string;
}) {
  return async (newStatus: string, newFulfillmentStatus: string) => {
    if (!order) return;
    try {
      const updatePayload: any = {
        status: newStatus,
        fulfillment_status: newFulfillmentStatus,
        updated_at: new Date().toISOString(),
      };
      if (newStatus === "completed") {
        updatePayload.delivered_at = new Date().toISOString();
      }

      const { error } = await supabase.from("orders").update(updatePayload).eq("id", order.id);

      if (error) throw error;

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
      qc.invalidateQueries({ queryKey: ["orders", brandId] });
      qc.invalidateQueries({ queryKey: ["activity_logs"] });
    } catch (err: unknown) {
      toast.error(
        getFriendlyErrorMessage(err) ||
          (lang === "ar" ? "تعذر تحديث حالة الطلب" : "Unable to update order status"),
      );
      throw err;
    }
  };
}
