import { toast } from "sonner";
import type { QueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getFriendlyErrorMessage } from "@/lib/utils";
import { logActivity } from "@/lib/activity-log";
import { invalidateOrders } from "@/lib/data/orders";
import { invalidateActivityLogs } from "@/lib/data/activity-logs";
import type { getOrderWorkflow } from "@/lib/order-workflow";
import type { Order } from "@/features/orders/types";
import type { OrderDetailData } from "@/features/orders/hooks/use-order-detail-data";

/**
 * The steps that end an order on its own page: a service carried out (collecting any balance) and
 * a paid digital order delivered. Returns null for any other step. Both complete the order, and
 * the booking follows its order (`sync_bookings_with_order`).
 */
export function renderDoneAction({
  workflow,
  completeOrder,
  lang,
  order,
  orderQ,
  qc,
  brandId,
}: {
  workflow: ReturnType<typeof getOrderWorkflow>;
  completeOrder: (collects: boolean) => Promise<void>;
  lang: "ar" | "en";
  order: Order;
  orderQ: OrderDetailData["orderQ"];
  qc: QueryClient;
  brandId: string;
}) {
  // An appointment whose time has come: the service was carried out. Any
  // balance (cash, or the rest after a deposit) is collected with it; the
  // booking follows the order to "completed" (sync_bookings_with_order).
  if (
    workflow.nextAction === "complete_service" ||
    workflow.nextAction === "collect_and_complete_service"
  ) {
    const collects = workflow.nextAction === "collect_and_complete_service";
    return (
      <Button
        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md transition-transform hover:scale-[1.02] active:scale-95"
        onClick={async () => {
          try {
            await completeOrder(collects);
            toast.success(lang === "ar" ? "تم تنفيذ الخدمة وإتمام الطلب" : "Service completed");
            await logActivity({
              action: "status_change",
              order_id: order.id,
              en: collects
                ? "Collected the balance and completed the service"
                : "Completed the service",
              ar: collects ? "تحصيل المبلغ المتبقي وإتمام الخدمة" : "تم تنفيذ الخدمة",
            });
            await orderQ.refetch();
            invalidateOrders(qc, brandId);
            invalidateActivityLogs(qc);
          } catch (err: unknown) {
            toast.error(
              getFriendlyErrorMessage(err) ||
                (lang === "ar" ? "تعذر إتمام الخدمة" : "Unable to complete the service"),
            );
          }
        }}
      >
        <CheckCircle2 className="h-4 w-4 me-1.5" />
        {collects
          ? lang === "ar"
            ? "تحصيل المتبقي وإتمام الخدمة"
            : "Collect balance & complete"
          : lang === "ar"
            ? "تم تنفيذ الخدمة"
            : "Service done"}
      </Button>
    );
  }

  // A paid digital order: the files or the link were sent to the customer's channel; record it.
  if (workflow.nextAction === "deliver_digital") {
    return (
      <Button
        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md transition-transform hover:scale-[1.02] active:scale-95"
        onClick={async () => {
          try {
            await completeOrder(false);
            toast.success(lang === "ar" ? "تم تسليم الطلب الرقمي" : "Digital order delivered");
            await logActivity({
              action: "status_change",
              order_id: order.id,
              en: "Marked the digital order delivered",
              ar: "تم تسليم الطلب الرقمي",
            });
            await orderQ.refetch();
            invalidateOrders(qc, brandId);
            invalidateActivityLogs(qc);
          } catch (err: unknown) {
            toast.error(
              getFriendlyErrorMessage(err) ||
                (lang === "ar" ? "تعذر تسجيل التسليم" : "Unable to record the delivery"),
            );
          }
        }}
      >
        <CheckCircle2 className="h-4 w-4 me-1.5" />
        {lang === "ar" ? "تم تسليم الطلب الرقمي" : "Mark digital order delivered"}
      </Button>
    );
  }

  return null;
}
