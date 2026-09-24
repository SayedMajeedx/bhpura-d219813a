import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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

export type OrderPrimaryActionContext = {
  approveBenefitPayment: () => Promise<void>;
  approvingBenefit: boolean;
  brandId: string;
  isCreationMode: boolean;
  isReadOnly: boolean;
  items: OrderItem[];
  lang: ReturnType<typeof useI18n>["lang"];
  order: Order | null;
  orderQ: OrderDetailData["orderQ"];
  qc: QueryClient;
  storeProfile: ReturnType<typeof useAdminStoreProfile>["profile"];
  vocabulary: ReturnType<typeof useVocabulary>["vocabulary"];
};

/**
 * The order's next workflow step as one button (send to workshop, pack, ship,
 * mark delivered, validate payment...). Returns null in creation or read-only
 * mode and when there is no next step, so callers can hide the slot.
 */
export function renderOrderPrimaryAction(ctx: OrderPrimaryActionContext) {
  const {
    approveBenefitPayment,
    approvingBenefit,
    brandId,
    isCreationMode,
    isReadOnly,
    items,
    lang,
    order,
    orderQ,
    qc,
    storeProfile,
    vocabulary,
  } = ctx;
  if (isCreationMode || !order || isReadOnly) return null;
  const computedOrderType = detectOrderType(items, order?.order_type);
  const workflow = getOrderWorkflow(
    { ...order, order_type: computedOrderType },
    { productionStages: storeProfile.modules.made_to_order },
  );

  if (storeProfile.modules.made_to_order && workflow.nextAction === "send_to_tailor") {
    return (
      <Button
        className="bg-purple-600 hover:bg-purple-700 text-white font-bold shadow-md transition-transform hover:scale-[1.02] active:scale-95"
        onClick={async () => {
          try {
            const { error } = await supabase
              .from("orders")
              .update({
                status: "sent_to_tailor",
                fulfillment_status: "SENT_TO_TAILOR",
                updated_at: new Date().toISOString(),
              } as any)
              .eq("id", order.id);
            if (error) throw error;
            toast.success(
              vocabulary.sent_to_workshop_success[lang] ||
                (lang === "ar" ? "تم تحويل الطلب للورشة وتحديث الحالة" : "Sent to workshop"),
            );
            await logActivity({
              action: "status_change",
              order_id: order.id,
              en: "Sent order to workshop for processing",
              ar: "تحويل الطلب إلى الورشة للتجهيز",
            });
            await orderQ.refetch();
            qc.invalidateQueries({ queryKey: ["orders", brandId] });
            qc.invalidateQueries({ queryKey: ["activity_logs"] });
          } catch (err: unknown) {
            toast.error(
              getFriendlyErrorMessage(err) ||
                (lang === "ar" ? "تعذر تحديث الحالة" : "Unable to update status"),
            );
          }
        }}
      >
        <Scissors className="h-4 w-4 me-1.5" />
        {vocabulary.sent_to_workshop[lang] || (lang === "ar" ? "إرسال للورشة" : "Send to Workshop")}
      </Button>
    );
  }

  if (storeProfile.modules.made_to_order && workflow.nextAction === "receive_from_tailor") {
    return (
      <Button
        className="bg-teal-600 hover:bg-teal-700 text-white font-bold shadow-md transition-transform hover:scale-[1.02] active:scale-95"
        onClick={async () => {
          try {
            const { error } = await supabase
              .from("orders")
              .update({
                status: "received_from_tailor",
                fulfillment_status: "RECEIVED_FROM_TAILOR",
                updated_at: new Date().toISOString(),
              } as any)
              .eq("id", order.id);
            if (error) throw error;
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
            qc.invalidateQueries({ queryKey: ["orders", brandId] });
            qc.invalidateQueries({ queryKey: ["activity_logs"] });
          } catch (err: unknown) {
            toast.error(
              getFriendlyErrorMessage(err) ||
                (lang === "ar" ? "تعذر تحديث الحالة" : "Unable to update status"),
            );
          }
        }}
      >
        <PackageCheck className="h-4 w-4 me-1.5" />
        {vocabulary.received_from_workshop[lang] ||
          (lang === "ar" ? "استلام من الورشة" : "Receive from Workshop")}
      </Button>
    );
  }

  if (workflow.nextAction === "start_packing") {
    return (
      <Button
        className="bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-md transition-transform hover:scale-[1.02] active:scale-95"
        onClick={async () => {
          try {
            const { error } = await supabase
              .from("orders")
              .update({
                status: "packing",
                fulfillment_status: "PACKING",
                updated_at: new Date().toISOString(),
              } as any)
              .eq("id", order.id);
            if (error) throw error;
            toast.success(lang === "ar" ? "بدء تعبئة وتغليف الطلب الجاهز" : "Start packing order");
            await logActivity({
              action: "status_change",
              order_id: order.id,
              en: "Started packing order items",
              ar: "بدء تعبئة وتغليف منتجات الطلب",
            });
            await orderQ.refetch();
            qc.invalidateQueries({ queryKey: ["orders", brandId] });
            qc.invalidateQueries({ queryKey: ["activity_logs"] });
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
            const { error } = await supabase
              .from("orders")
              .update({
                status: "ready_for_pickup",
                fulfillment_status: "READY_FOR_PICKUP",
                updated_at: new Date().toISOString(),
              } as any)
              .eq("id", order.id);
            if (error) throw error;
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
            qc.invalidateQueries({ queryKey: ["orders", brandId] });
            qc.invalidateQueries({ queryKey: ["activity_logs"] });
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
            const { error } = await supabase
              .from("orders")
              .update({
                status: "shipped",
                fulfillment_status: "SHIPPED",
                updated_at: new Date().toISOString(),
              } as any)
              .eq("id", order.id);
            if (error) throw error;
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
            qc.invalidateQueries({ queryKey: ["orders", brandId] });
            qc.invalidateQueries({ queryKey: ["activity_logs"] });
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

  if (workflow.nextAction === "mark_completed") {
    return (
      <Button
        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md transition-transform hover:scale-[1.02] active:scale-95"
        onClick={async () => {
          try {
            const { error } = await supabase
              .from("orders")
              .update({
                status: "completed",
                fulfillment_status: "COMPLETED",
                delivered_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              } as any)
              .eq("id", order.id);
            if (error) throw error;
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
            qc.invalidateQueries({ queryKey: ["orders", brandId] });
            qc.invalidateQueries({ queryKey: ["activity_logs"] });
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
            const { error } = await supabase
              .from("orders")
              .update({
                fulfillment_status: "ASSIGNED",
                updated_at: new Date().toISOString(),
              } as any)
              .eq("id", order.id);
            if (error) throw error;
            toast.success(
              lang === "ar" ? "تم جاهزية الطلب وتعيينه للمندوب" : "Packed & Assigned to Courier",
            );
            await orderQ.refetch();
            qc.invalidateQueries({ queryKey: ["orders", brandId] });
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
            const { error } = await supabase
              .from("orders")
              .update({
                fulfillment_status: "SHIPPED",
                updated_at: new Date().toISOString(),
              } as any)
              .eq("id", order.id);
            if (error) throw error;
            toast.success(
              lang === "ar"
                ? "تم استلام الشحنة من المندوب وخرجت للتوصيل"
                : "Courier picked up parcel - Out for Delivery",
            );
            await orderQ.refetch();
            qc.invalidateQueries({ queryKey: ["orders", brandId] });
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
    return (
      <Button
        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md transition-transform hover:scale-[1.02] active:scale-95"
        onClick={async () => {
          try {
            const updatePayload: Record<string, any> = {
              fulfillment_status: "COMPLETED",
              status: "completed",
              delivered_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            if (
              workflow.nextAction === "collect_and_deliver" ||
              workflow.nextAction === "collect_and_hand_over" ||
              order.payment_method === "cod"
            ) {
              updatePayload.payment_status = "paid";
            }
            const { error } = await supabase
              .from("orders")
              .update(updatePayload as any)
              .eq("id", order.id);
            if (error) throw error;
            toast.success(
              lang === "ar" ? "تم تسجيل تسليم الطلب وإتمامه" : "Order delivered & completed",
            );
            await orderQ.refetch();
            qc.invalidateQueries({ queryKey: ["orders", brandId] });
          } catch (err: unknown) {
            toast.error(
              getFriendlyErrorMessage(err) ||
                (lang === "ar" ? "تعذر إكمال التسليم" : "Unable to complete delivery"),
            );
          }
        }}
      >
        <CheckCircle2 className="h-4 w-4 me-1.5" />
        {lang === "ar" ? "تسليم الطلب" : "Mark Delivered"}
      </Button>
    );
  }

  if (workflow.nextAction === "prepare_pickup") {
    return (
      <Button
        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md transition-transform hover:scale-[1.02] active:scale-95"
        onClick={async () => {
          try {
            const { error } = await supabase
              .from("orders")
              .update({
                fulfillment_status: "READY_FOR_PICKUP",
                updated_at: new Date().toISOString(),
              } as any)
              .eq("id", order.id);
            if (error) throw error;
            toast.success(lang === "ar" ? "تم تجهيز الطلب للاستلام" : "Ready for pickup");
            await orderQ.refetch();
            qc.invalidateQueries({ queryKey: ["orders", brandId] });
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
    return (
      <Button
        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md transition-transform hover:scale-[1.02] active:scale-95"
        onClick={async () => {
          try {
            const { error } = await supabase
              .from("orders")
              .update({
                fulfillment_status: "COMPLETED",
                status: "completed",
                delivered_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              } as any)
              .eq("id", order.id);
            if (error) throw error;
            toast.success(lang === "ar" ? "تم تسليم الطلب للعميل" : "Handed over to customer");
            await orderQ.refetch();
            qc.invalidateQueries({ queryKey: ["orders", brandId] });
          } catch (err: unknown) {
            toast.error(
              getFriendlyErrorMessage(err) ||
                (lang === "ar" ? "تعذر إكمال التسليم" : "Unable to complete handover"),
            );
          }
        }}
      >
        <CheckCircle2 className="h-4 w-4 me-1.5" />
        {lang === "ar" ? "تسليم العميل" : "Hand Over"}
      </Button>
    );
  }

  return null;
}
