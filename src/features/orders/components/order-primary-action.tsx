import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Receipt,
  Loader2,
  CheckCircle2,
  Truck,
  Scissors,
  PackageCheck,
  Box,
  Store,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { getFriendlyErrorMessage } from "@/lib/utils";
import { logActivity } from "@/lib/activity-log";
import { useAdminStoreProfile } from "@/hooks/use-store-profile";
import { getOrderWorkflow } from "@/lib/order-workflow";
import { detectOrderType } from "@/lib/order-type-detector";
import { useVocabulary } from "@/hooks/use-vocabulary";
import type { QueryClient } from "@tanstack/react-query";
import type { Order, OrderItem } from "@/features/orders/types";
import type { OrderDetailData } from "@/features/orders/hooks/use-order-detail-data";
import { courierCompleteDelivery, invalidateOrders, updateOrder } from "@/lib/data/orders";
import { invalidateActivityLogs } from "@/lib/data/activity-logs";
import { workshopActionLabels } from "@/lib/store-vocabulary";
import { renderDoneAction } from "@/features/orders/components/order-done-actions";
import {
  ReceiveFromTailorButton,
  SendToTailorButton,
} from "@/features/supplier-orders/components/TailorButtons";

export type OrderPrimaryActionContext = {
  approveBenefitPayment: () => Promise<void>;
  approvingBenefit: boolean;
  brandId: string;
  isCreationMode: boolean;
  items: OrderItem[];
  lang: ReturnType<typeof useI18n>["lang"];
  order: Order | null;
  orderQ: OrderDetailData["orderQ"];
  qc: QueryClient;
  storeProfile: ReturnType<typeof useAdminStoreProfile>["profile"];
  vocabulary: ReturnType<typeof useVocabulary>["vocabulary"];
  /** After the piece goes to the workshop, staff can tell the customer on WhatsApp. */
  workshop?: { tellCustomerWorkStarted?: () => void };
};

/**
 * The order's next workflow step as one button (send to workshop, pack, ship,
 * mark delivered, validate payment...). Returns null while the order is being
 * created and when there is no next step, so callers can hide the slot. It is
 * offered in view mode too: a step writes the order's stage on its own, not the
 * editor's fields, and the list offers the same step without an unlock (hidden
 * there, moving an order on a phone took an unlock first).
 */
export function renderOrderPrimaryAction(ctx: OrderPrimaryActionContext) {
  const {
    approveBenefitPayment,
    approvingBenefit,
    brandId,
    isCreationMode,
    items,
    lang,
    order,
    orderQ,
    qc,
    storeProfile,
    vocabulary,
    workshop,
  } = ctx;
  if (isCreationMode || !order) return null;
  const computedOrderType = detectOrderType(items);
  const workflow = getOrderWorkflow(
    { ...order, order_type: computedOrderType },
    { productionStages: storeProfile.modules.made_to_order },
  );

  /**
   * Hands the order over. When a balance is collected with it, the same server step the list
   * and the courier use records the amount; writing "paid" from here left the collected amount
   * behind (an invoice with a balance on a paid order), and a pickup was handed over with its
   * balance never recorded at all.
   */
  const completeOrder = async (collects: boolean) => {
    if (collects) {
      const error = await courierCompleteDelivery(order.id, workflow.outstanding, null);
      if (error) throw error;
      return;
    }
    await updateOrder(brandId, order.id, {
      fulfillment_status: "COMPLETED",
      status: "completed",
      delivered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  };

  /** Every step is in the order's activity trail, as the packing, shipping and completion steps were. */
  const record = async (en: string, ar: string) => {
    await logActivity({ action: "status_change", order_id: order.id, en, ar });
    invalidateActivityLogs(qc);
  };

  if (storeProfile.modules.made_to_order && workflow.nextAction === "send_to_tailor") {
    // After the stage moves (on a supplier's order or as a stage alone): tell, log, refresh.
    const afterSend = async () => {
      toast.success(
        vocabulary.sent_to_workshop_success[lang] ||
          (lang === "ar" ? "تم تحويل الطلب للورشة وتحديث الحالة" : "Sent to workshop"),
        workshop?.tellCustomerWorkStarted
          ? {
              duration: 12000,
              action: {
                label: lang === "ar" ? "أبلغ العميل واتساب" : "Tell the customer",
                onClick: workshop.tellCustomerWorkStarted,
              },
            }
          : undefined,
      );
      await logActivity({
        action: "status_change",
        order_id: order.id,
        en: "Sent order to workshop for processing",
        ar: "تحويل الطلب إلى الورشة للتجهيز",
      });
      await orderQ.refetch();
      invalidateOrders(qc, brandId);
      invalidateActivityLogs(qc);
    };
    const plainSend = async () => {
      try {
        await updateOrder(brandId, order.id, {
          status: "sent_to_tailor",
          fulfillment_status: "SENT_TO_TAILOR",
          updated_at: new Date().toISOString(),
        });
        await afterSend();
      } catch (err: unknown) {
        toast.error(
          getFriendlyErrorMessage(err) ||
            (lang === "ar" ? "تعذر تحديث الحالة" : "Unable to update status"),
        );
      }
    };
    return (
      <SendToTailorButton
        brandId={brandId}
        orderId={order.id}
        lines={items}
        lang={lang === "ar" ? "ar" : "en"}
        className="bg-purple-600 hover:bg-purple-700 text-white font-bold shadow-md transition-transform hover:scale-[1.02] active:scale-95"
        onPlainSend={plainSend}
        onSent={afterSend}
        title={workshopActionLabels(vocabulary, lang).send}
      >
        <Scissors className="h-4 w-4 me-1.5" />
        {workshopActionLabels(vocabulary, lang).send}
      </SendToTailorButton>
    );
  }

  if (storeProfile.modules.made_to_order && workflow.nextAction === "receive_from_tailor") {
    const afterReceive = async () => {
      toast.success(
        vocabulary.received_from_workshop_success[lang] ||
          (lang === "ar" ? "تم استلام الطلب من الورشة وتجهيزه" : "Received from workshop"),
      );
      await logActivity({
        action: "status_change",
        order_id: order.id,
        en: "Received customized order from workshop",
        ar: "تم استلام الطلب الجاهز من الورشة",
      });
      await orderQ.refetch();
      invalidateOrders(qc, brandId);
      invalidateActivityLogs(qc);
    };
    const plainReceive = async () => {
      try {
        await updateOrder(brandId, order.id, {
          status: "received_from_tailor",
          fulfillment_status: "RECEIVED_FROM_TAILOR",
          updated_at: new Date().toISOString(),
        });
        await afterReceive();
      } catch (err: unknown) {
        toast.error(
          getFriendlyErrorMessage(err) ||
            (lang === "ar" ? "تعذر تحديث الحالة" : "Unable to update status"),
        );
      }
    };
    return (
      <ReceiveFromTailorButton
        brandId={brandId}
        lines={items}
        lang={lang === "ar" ? "ar" : "en"}
        className="bg-teal-600 hover:bg-teal-700 text-white font-bold shadow-md transition-transform hover:scale-[1.02] active:scale-95"
        onPlainReceive={plainReceive}
        onReceived={afterReceive}
      >
        <PackageCheck className="h-4 w-4 me-1.5" />
        {workshopActionLabels(vocabulary, lang).receive}
      </ReceiveFromTailorButton>
    );
  }

  if (workflow.nextAction === "start_packing") {
    return (
      <Button
        className="bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-md transition-transform hover:scale-[1.02] active:scale-95"
        onClick={async () => {
          try {
            await updateOrder(brandId, order.id, {
              status: "packing",
              fulfillment_status: "PACKING",
              updated_at: new Date().toISOString(),
            });
            toast.success(lang === "ar" ? "بدء تعبئة وتغليف الطلب الجاهز" : "Start packing order");
            await logActivity({
              action: "status_change",
              order_id: order.id,
              en: "Started packing order items",
              ar: "بدء تعبئة وتغليف منتجات الطلب",
            });
            await orderQ.refetch();
            invalidateOrders(qc, brandId);
            invalidateActivityLogs(qc);
          } catch (err: unknown) {
            toast.error(
              getFriendlyErrorMessage(err) ||
                (lang === "ar" ? "تعذر تحديث الحالة" : "Unable to update status"),
            );
          }
        }}
      >
        <Box className="h-4 w-4 me-1.5" />
        {lang === "ar" ? "بدء التعبئة والتغليف" : "Start Packing"}
      </Button>
    );
  }

  if (workflow.nextAction === "mark_ready_pickup") {
    return (
      <Button
        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md transition-transform hover:scale-[1.02] active:scale-95"
        onClick={async () => {
          try {
            await updateOrder(brandId, order.id, {
              status: "ready_for_pickup",
              fulfillment_status: "READY_FOR_PICKUP",
              updated_at: new Date().toISOString(),
            });
            toast.success(
              lang === "ar" ? "تم تجهيز الطلب للاستلام في المحل" : "Marked ready for pickup",
            );
            await logActivity({
              action: "status_change",
              order_id: order.id,
              en: "Marked order ready for in-store pickup",
              ar: "تجهيز الطلب للاستلام من الفرع/المحل",
            });
            await orderQ.refetch();
            invalidateOrders(qc, brandId);
            invalidateActivityLogs(qc);
          } catch (err: unknown) {
            toast.error(
              getFriendlyErrorMessage(err) ||
                (lang === "ar" ? "تعذر تحديث الحالة" : "Unable to update status"),
            );
          }
        }}
      >
        <Store className="h-4 w-4 me-1.5" />
        {lang === "ar" ? "جاهز للاستلام" : "Mark Ready for Pickup"}
      </Button>
    );
  }

  if (workflow.nextAction === "mark_shipped") {
    return (
      <Button
        className="bg-sky-600 hover:bg-sky-700 text-white font-bold shadow-md transition-transform hover:scale-[1.02] active:scale-95"
        onClick={async () => {
          try {
            await updateOrder(brandId, order.id, {
              status: "shipped",
              fulfillment_status: "SHIPPED",
              updated_at: new Date().toISOString(),
            });
            toast.success(
              lang === "ar" ? "تم شحن الطلب وتسليمه للمندوب" : "Marked shipped / in transit",
            );
            await logActivity({
              action: "status_change",
              order_id: order.id,
              en: "Marked order shipped / handed to courier",
              ar: "تم تسليم الطلب لشركة الشحن/المندوب",
            });
            await orderQ.refetch();
            invalidateOrders(qc, brandId);
            invalidateActivityLogs(qc);
          } catch (err: unknown) {
            toast.error(
              getFriendlyErrorMessage(err) ||
                (lang === "ar" ? "تعذر تحديث الحالة" : "Unable to update status"),
            );
          }
        }}
      >
        <Truck className="h-4 w-4 me-1.5" />
        {lang === "ar" ? "تم الشحن" : "Mark Shipped"}
      </Button>
    );
  }

  // The steps that end a service or a digital order (see order-done-actions).
  const done = renderDoneAction({ workflow, completeOrder, lang, order, orderQ, qc, brandId });
  if (done) return done;

  if (workflow.nextAction === "mark_completed") {
    return (
      <Button
        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md transition-transform hover:scale-[1.02] active:scale-95"
        onClick={async () => {
          try {
            await updateOrder(brandId, order.id, {
              status: "completed",
              fulfillment_status: "COMPLETED",
              delivered_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
            toast.success(
              lang === "ar" ? "تم تسليم الطلب وإتمامه بنجاح" : "Order completed successfully",
            );
            await logActivity({
              action: "status_change",
              order_id: order.id,
              en: "Completed order delivery",
              ar: "تم إكمال وتسليم الطلب بنجاح",
            });
            await orderQ.refetch();
            invalidateOrders(qc, brandId);
            invalidateActivityLogs(qc);
          } catch (err: unknown) {
            toast.error(
              getFriendlyErrorMessage(err) ||
                (lang === "ar" ? "تعذر إكمال التسليم" : "Unable to complete order"),
            );
          }
        }}
      >
        <CheckCircle2 className="h-4 w-4 me-1.5" />
        {lang === "ar" ? "إكمال التسليم" : "Complete Order"}
      </Button>
    );
  }

  if (workflow.nextAction === "pack_and_ship") {
    return (
      <Button
        className="bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-md transition-transform hover:scale-[1.02] active:scale-95"
        onClick={async () => {
          try {
            await updateOrder(brandId, order.id, {
              fulfillment_status: "ASSIGNED",
              updated_at: new Date().toISOString(),
            });
            toast.success(
              lang === "ar" ? "تم جاهزية الطلب وتعيينه للمندوب" : "Packed & Assigned to Courier",
            );
            await record(
              "Packed the order and assigned it to a courier",
              "تجهيز الطلب وتعيينه للمندوب",
            );
            await orderQ.refetch();
            invalidateOrders(qc, brandId);
          } catch (err: unknown) {
            toast.error(
              getFriendlyErrorMessage(err) ||
                (lang === "ar" ? "تعذر تحديث الحالة" : "Unable to update status"),
            );
          }
        }}
      >
        <Truck className="h-4 w-4 me-1.5" />
        {lang === "ar" ? "تجهيز وتعيين المندوب" : "Pack & Assign"}
      </Button>
    );
  }

  if (workflow.nextAction === "confirm_pickup") {
    return (
      <Button
        className="bg-sky-600 hover:bg-sky-700 text-white font-bold shadow-md transition-transform hover:scale-[1.02] active:scale-95"
        onClick={async () => {
          try {
            await updateOrder(brandId, order.id, {
              fulfillment_status: "SHIPPED",
              updated_at: new Date().toISOString(),
            });
            toast.success(
              lang === "ar"
                ? "تم استلام الشحنة من المندوب وخرجت للتوصيل"
                : "Courier picked up parcel - Out for Delivery",
            );
            await record(
              "Courier picked up the parcel: out for delivery",
              "استلم المندوب الشحنة وخرجت للتوصيل",
            );
            await orderQ.refetch();
            invalidateOrders(qc, brandId);
          } catch (err: unknown) {
            toast.error(
              getFriendlyErrorMessage(err) ||
                (lang === "ar" ? "تعذر تحديث الحالة" : "Unable to update status"),
            );
          }
        }}
      >
        <Truck className="h-4 w-4 me-1.5" />
        {lang === "ar" ? "تأكيد استلام المندوب (خرج للتوصيل)" : "Confirm Pickup (Start Transit)"}
      </Button>
    );
  }

  if (workflow.nextAction === "validate_payment") {
    return (
      <Button
        className="bg-purple-600 hover:bg-purple-700 text-white font-bold shadow-md transition-transform hover:scale-[1.02] active:scale-95"
        disabled={approvingBenefit}
        onClick={approveBenefitPayment}
      >
        {approvingBenefit ? (
          <Loader2 className="h-4 w-4 me-1.5 animate-spin" />
        ) : (
          <Receipt className="h-4 w-4 me-1.5" />
        )}
        {lang === "ar" ? "اعتماد دفع البنفت" : "Approve Benefit Payment"}
      </Button>
    );
  }

  if (workflow.nextAction === "mark_delivered" || workflow.nextAction === "collect_and_deliver") {
    const collects = workflow.nextAction === "collect_and_deliver";
    return (
      <Button
        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md transition-transform hover:scale-[1.02] active:scale-95"
        onClick={async () => {
          try {
            await completeOrder(collects);
            toast.success(
              lang === "ar" ? "تم تسجيل تسليم الطلب وإتمامه" : "Order delivered & completed",
            );
            await record(
              collects
                ? "Collected the balance and delivered the order"
                : "Marked the order delivered",
              collects ? "تحصيل المتبقي وتسليم الطلب" : "تم تسليم الطلب",
            );
            await orderQ.refetch();
            invalidateOrders(qc, brandId);
          } catch (err: unknown) {
            toast.error(
              getFriendlyErrorMessage(err) ||
                (lang === "ar" ? "تعذر إكمال التسليم" : "Unable to complete delivery"),
            );
          }
        }}
      >
        <CheckCircle2 className="h-4 w-4 me-1.5" />
        {collects
          ? lang === "ar"
            ? "تحصيل المتبقي وتسليم الطلب"
            : "Collect balance & deliver"
          : lang === "ar"
            ? "تسليم الطلب"
            : "Mark Delivered"}
      </Button>
    );
  }

  if (workflow.nextAction === "prepare_pickup") {
    return (
      <Button
        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md transition-transform hover:scale-[1.02] active:scale-95"
        onClick={async () => {
          try {
            await updateOrder(brandId, order.id, {
              fulfillment_status: "READY_FOR_PICKUP",
              updated_at: new Date().toISOString(),
            });
            toast.success(lang === "ar" ? "تم تجهيز الطلب للاستلام" : "Ready for pickup");
            await record("Prepared the order for pickup", "تجهيز الطلب للاستلام");
            await orderQ.refetch();
            invalidateOrders(qc, brandId);
          } catch (err: unknown) {
            toast.error(
              getFriendlyErrorMessage(err) ||
                (lang === "ar" ? "تعذر تحديث الحالة" : "Unable to update status"),
            );
          }
        }}
      >
        <CheckCircle2 className="h-4 w-4 me-1.5" />
        {lang === "ar" ? "تجهيز للاستلام" : "Prepare for Pickup"}
      </Button>
    );
  }

  if (
    workflow.nextAction === "hand_over_pickup" ||
    workflow.nextAction === "collect_and_hand_over"
  ) {
    const collects = workflow.nextAction === "collect_and_hand_over";
    return (
      <Button
        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md transition-transform hover:scale-[1.02] active:scale-95"
        onClick={async () => {
          try {
            await completeOrder(collects);
            toast.success(lang === "ar" ? "تم تسليم الطلب للعميل" : "Handed over to customer");
            await record(
              collects
                ? "Collected the balance and handed the order over"
                : "Handed the order over to the customer",
              collects ? "تحصيل المتبقي وتسليم الطلب للعميل" : "تسليم الطلب للعميل",
            );
            await orderQ.refetch();
            invalidateOrders(qc, brandId);
          } catch (err: unknown) {
            toast.error(
              getFriendlyErrorMessage(err) ||
                (lang === "ar" ? "تعذر إكمال التسليم" : "Unable to complete handover"),
            );
          }
        }}
      >
        <CheckCircle2 className="h-4 w-4 me-1.5" />
        {collects
          ? lang === "ar"
            ? "تحصيل المتبقي وتسليم العميل"
            : "Collect balance & hand over"
          : lang === "ar"
            ? "تسليم العميل"
            : "Hand Over"}
      </Button>
    );
  }

  return null;
}
