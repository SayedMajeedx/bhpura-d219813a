import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { resolvePaymentStatus } from "@/lib/payment-status";
import { Loader2 } from "lucide-react";
import { getOrderWorkflow } from "@/lib/order-workflow";
import { useVocabulary } from "@/hooks/use-vocabulary";
import { invalidateOrders, ordersKeys, type OrderListRow } from "@/lib/data/orders";

import { authenticatedJsonHeaders } from "@/features/orders/actions/order-links";
import type { Dispatch, SetStateAction } from "react";
import type { QueryClient } from "@tanstack/react-query";
import {
  renderDeliveryQueueAction,
  renderPickupQueueAction,
} from "@/features/orders/components/order-queue-fulfillment-actions";

export type OrderQueueActionContext = {
  brandId: string;
  handleCompleteDelivery: (
    order: Order,
    amountToCollect: number,
    notes?: string,
  ) => Promise<unknown>;
  hasMadeToOrder: boolean;
  isSubmittingCash: boolean;
  lang: ReturnType<typeof useI18n>["lang"];
  qc: QueryClient;
  setCashCollectedAmount: Dispatch<SetStateAction<string>>;
  setCashModalNotes: Dispatch<SetStateAction<string>>;
  setCashModalOrder: Dispatch<SetStateAction<any | null>>;
  setFulfillNotes: Dispatch<SetStateAction<string>>;
  setIsFulfillModalOpen: Dispatch<SetStateAction<boolean>>;
  setSelectedCourierId: Dispatch<SetStateAction<string>>;
  setSelectedFulfillOrder: Dispatch<SetStateAction<any | null>>;
  setUpdatingOrderId: Dispatch<SetStateAction<string | null>>;
  slug: string;
  updatingOrderId: string | null;
  vocabulary: ReturnType<typeof useVocabulary>["vocabulary"];
};

import type { Order } from "@/features/orders/types";
/** What an order row's action button depends on, plus the status-update call it makes. */
export function queueActionState(ctx: OrderQueueActionContext, o: Order) {
  const { brandId, hasMadeToOrder, lang, qc, setUpdatingOrderId, updatingOrderId } = ctx;
  const workflow = getOrderWorkflow(o, { productionStages: hasMadeToOrder });
  const paymentBadge = resolvePaymentStatus(
    o.payment_status,
    o.status,
    Number(o.total),
    Number(o.advance_paid ?? 0),
  );
  const isPaid = paymentBadge === "paid";
  const isPartiallyPaid = paymentBadge === "partial";
  const isRefunded = paymentBadge === "refunded";
  const ff = String(o.fulfillment_status || "ON_HOLD").toUpperCase();
  const orderStatus = String(o.status || "").toUpperCase();
  const isUpdating = updatingOrderId === o.id;
  const isDelivered =
    ["COMPLETED", "DELIVERED"].includes(ff) || ["COMPLETED", "DELIVERED"].includes(orderStatus);
  const isCancelled = ff === "CANCELLED" || orderStatus === "CANCELLED";
  const isOutForDelivery = [
    "SHIPPED",
    "ASSIGNED",
    "OUT_FOR_DELIVERY",
    "READY_FOR_DELIVERY",
  ].includes(ff);

  const method = String(o.payment_method || "").toLowerCase();
  const isCod = ["cash", "cod"].includes(method);

  const isPickup = String(o.fulfillment_method || "").toLowerCase() === "pickup";
  const isDigital = String(o.fulfillment_method || "").toLowerCase() === "digital";

  const handleStatusUpdate = async (payload: Record<string, any>, successMsg: string) => {
    setUpdatingOrderId(o.id);
    try {
      const res = await fetch("/api/orders/status", {
        method: "PATCH",
        headers: await authenticatedJsonHeaders(),
        body: JSON.stringify({ id: o.id, admin_override: true, ...payload }),
      });
      const data = await res.json<{
        error?: string;
        error_ar?: string;
        order?: Record<string, any>;
      }>();
      if (!res.ok) throw new Error(data.error_ar && lang === "ar" ? data.error_ar : data.error);
      if (data.order) {
        qc.setQueriesData<OrderListRow[]>({ queryKey: ordersKeys.lists(brandId) }, (current) =>
          current?.map((item) =>
            item.id === o.id
              ? {
                  ...item,
                  ...data.order,
                  customers: item.customers,
                  order_items: item.order_items,
                }
              : item,
          ),
        );
      }
      toast.success(successMsg);
      await invalidateOrders(qc, brandId);
    } catch (err: any) {
      toast.error(err.message || "Failed to update order status");
    } finally {
      setUpdatingOrderId(null);
    }
  };

  return {
    workflow,
    paymentBadge,
    isPaid,
    isPartiallyPaid,
    isRefunded,
    ff,
    orderStatus,
    isUpdating,
    isDelivered,
    isCancelled,
    isOutForDelivery,
    method,
    isCod,
    isPickup,
    isDigital,
    handleStatusUpdate,
  };
}

export type QueueActionState = ReturnType<typeof queueActionState>;

/**
 * The one-click next step shown on an order row (confirm, pack, hand to a
 * courier, collect cash, mark picked up...), or a link to the order.
 */
export function renderOrderQueueAction(ctx: OrderQueueActionContext, o: Order) {
  const {
    hasMadeToOrder,
    lang,
    setFulfillNotes,
    setIsFulfillModalOpen,
    setSelectedCourierId,
    setSelectedFulfillOrder,
    slug,
    updatingOrderId,
    vocabulary,
  } = ctx;
  const state = queueActionState(ctx, o);
  const {
    handleStatusUpdate,
    isCancelled,
    isDelivered,
    isDigital,
    isOutForDelivery,
    isPickup,
    isRefunded,
    isUpdating,
    workflow,
  } = state;
  if (isDelivered) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400">
        <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
        {isPickup
          ? lang === "ar"
            ? "تم الاستلام"
            : "Picked Up"
          : lang === "ar"
            ? "تم التوصيل"
            : "Delivered"}
      </span>
    );
  }

  if (isCancelled || isRefunded) {
    return (
      <span className="inline-flex items-center rounded-md border border-border bg-muted/50 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
        {isRefunded
          ? lang === "ar"
            ? "تم الاسترجاع"
            : "Refunded"
          : lang === "ar"
            ? "ملغي"
            : "Cancelled"}
      </span>
    );
  }

  if (workflow.nextAction === "resolve_delivery_failure") {
    return (
      <Button size="sm" variant="destructive" className="h-8 px-3 text-xs font-semibold" asChild>
        <Link
          to="/admin/b/$slug/orders/$id"
          params={{ slug, id: o.id }}
          onClick={(e) => e.stopPropagation()}
        >
          {lang === "ar" ? "معالجة المشكلة" : "Resolve issue"}
        </Link>
      </Button>
    );
  }

  if (workflow.nextAction === "review_order") {
    return (
      <Button
        size="sm"
        variant="outline"
        className="h-8 px-3 text-xs font-semibold border-primary/40 text-primary hover:bg-primary/10"
        asChild
      >
        <Link
          to="/admin/b/$slug/orders/$id"
          params={{ slug, id: o.id }}
          onClick={(e) => e.stopPropagation()}
        >
          {lang === "ar" ? "معاينة الطلب" : "Review order"}
        </Link>
      </Button>
    );
  }

  if (
    hasMadeToOrder &&
    (workflow.nextAction === "send_to_tailor" || workflow.nextAction === "send_to_workshop")
  ) {
    return (
      <Button
        size="sm"
        className="h-8 text-xs px-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold shadow-2xs transition-all dark:bg-purple-700 dark:hover:bg-purple-800"
        disabled={updatingOrderId !== null}
        onClick={(e) => {
          e.stopPropagation();
          handleStatusUpdate(
            { fulfillment_status: "SENT_TO_TAILOR" },
            vocabulary.sent_to_workshop_success[lang] ||
              (lang === "ar" ? "تم الإرسال للورشة بنجاح!" : "Order sent to workshop!"),
          );
        }}
      >
        {isUpdating ? (
          <Loader2 className="animate-spin h-3.5 w-3.5" />
        ) : (
          vocabulary.sent_to_workshop[lang] || (lang === "ar" ? "إرسال للورشة" : "Send to Workshop")
        )}
      </Button>
    );
  }

  if (
    hasMadeToOrder &&
    (workflow.nextAction === "receive_from_tailor" ||
      workflow.nextAction === "receive_from_workshop")
  ) {
    return (
      <Button
        size="sm"
        className="h-8 text-xs px-3 bg-teal-600 hover:bg-teal-700 text-white font-semibold shadow-2xs transition-all dark:bg-teal-700 dark:hover:bg-teal-800"
        disabled={updatingOrderId !== null}
        onClick={(e) => {
          e.stopPropagation();
          handleStatusUpdate(
            { fulfillment_status: "RECEIVED_FROM_TAILOR" },
            vocabulary.received_from_workshop_success[lang] ||
              (lang === "ar" ? "تم استلام الطلب من الورشة بنجاح!" : "Received from workshop!"),
          );
        }}
      >
        {isUpdating ? (
          <Loader2 className="animate-spin h-3.5 w-3.5" />
        ) : (
          vocabulary.received_from_workshop[lang] ||
          (lang === "ar" ? "استلام من الورشة" : "Receive from Workshop")
        )}
      </Button>
    );
  }

  if (workflow.nextAction === "start_packing") {
    return (
      <Button
        size="sm"
        className="h-8 text-xs px-3 bg-amber-600 hover:bg-amber-700 text-white font-semibold shadow-2xs transition-all dark:bg-amber-700 dark:hover:bg-amber-800"
        disabled={updatingOrderId !== null}
        onClick={(e) => {
          e.stopPropagation();
          if (isPickup) {
            handleStatusUpdate(
              { fulfillment_status: "PACKING" },
              lang === "ar" ? "جارٍ التجهيز والتغليف!" : "Packing started!",
            );
          } else {
            setSelectedFulfillOrder(o);
            setSelectedCourierId(o.assigned_to ?? "unassigned");
            setFulfillNotes(o.delivery_notes ?? "");
            setIsFulfillModalOpen(true);
          }
        }}
      >
        {isUpdating ? (
          <Loader2 className="animate-spin h-3.5 w-3.5" />
        ) : lang === "ar" ? (
          "تجهيز الطلب"
        ) : (
          "Prepare Order"
        )}
      </Button>
    );
  }

  if (workflow.nextAction === "mark_ready_pickup") {
    return (
      <Button
        size="sm"
        className="h-8 text-xs px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-2xs transition-all dark:bg-indigo-700 dark:hover:bg-indigo-800"
        disabled={updatingOrderId !== null}
        onClick={(e) => {
          e.stopPropagation();
          handleStatusUpdate(
            { fulfillment_status: "READY_FOR_PICKUP" },
            lang === "ar" ? "تم تحديد الطلب كجاهز للاستلام!" : "Marked ready for pickup!",
          );
        }}
      >
        {isUpdating ? (
          <Loader2 className="animate-spin h-3.5 w-3.5" />
        ) : lang === "ar" ? (
          "جاهز للاستلام"
        ) : (
          "Mark Ready"
        )}
      </Button>
    );
  }

  if (workflow.nextAction === "mark_shipped") {
    return (
      <Button
        size="sm"
        className="h-8 text-xs px-3 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-2xs transition-all"
        disabled={updatingOrderId !== null}
        onClick={(e) => {
          e.stopPropagation();
          setSelectedFulfillOrder(o);
          setSelectedCourierId(o.assigned_to ?? "unassigned");
          setFulfillNotes(o.delivery_notes ?? "");
          setIsFulfillModalOpen(true);
        }}
      >
        {isUpdating ? (
          <Loader2 className="animate-spin h-3.5 w-3.5" />
        ) : lang === "ar" ? (
          "تحديث الشحن"
        ) : (
          "Fulfill / Ship"
        )}
      </Button>
    );
  }

  if (workflow.nextAction === "mark_completed") {
    return (
      <Button
        size="sm"
        className="h-8 text-xs px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-2xs transition-all dark:bg-emerald-700 dark:hover:bg-emerald-800"
        disabled={updatingOrderId !== null}
        onClick={(e) => {
          e.stopPropagation();
          handleStatusUpdate(
            { fulfillment_status: "COMPLETED" },
            lang === "ar" ? "تم إتمام الطلب بنجاح!" : "Order completed!",
          );
        }}
      >
        {isUpdating ? (
          <Loader2 className="animate-spin h-3.5 w-3.5" />
        ) : lang === "ar" ? (
          "إتمام الطلب"
        ) : (
          "Complete Order"
        )}
      </Button>
    );
  }

  if (isPickup) {
    const action = renderPickupQueueAction(ctx, o, state);
    if (action !== undefined) return action;
  } else if (!isDigital) {
    const action = renderDeliveryQueueAction(ctx, o, state);
    if (action !== undefined) return action;
  } else if (workflow.nextAction === "deliver_digital") {
    return (
      <Button size="sm" className="h-8 px-3 text-xs font-semibold" asChild>
        <Link
          to="/admin/b/$slug/orders/$id"
          params={{ slug, id: o.id }}
          onClick={(e) => e.stopPropagation()}
        >
          {lang === "ar" ? "إرسال الطلب الرقمي" : "Deliver digital order"}
        </Link>
      </Button>
    );
  }

  // Shipped Track button fallback
  if (isOutForDelivery) {
    return (
      <Button size="sm" variant="outline" className="h-8 text-xs px-3" asChild>
        <Link
          to="/admin/b/$slug/orders/$id"
          params={{ slug, id: o.id }}
          onClick={(e) => e.stopPropagation()}
        >
          {lang === "ar" ? "تتبع" : "Track"}
        </Link>
      </Button>
    );
  }

  // General fallback -> details
  return (
    <Button size="sm" variant="ghost" className="h-8 text-xs px-3" asChild>
      <Link
        to="/admin/b/$slug/orders/$id"
        params={{ slug, id: o.id }}
        onClick={(e) => e.stopPropagation()}
      >
        {lang === "ar" ? "تفاصيل" : "View"}
      </Link>
    </Button>
  );
}
