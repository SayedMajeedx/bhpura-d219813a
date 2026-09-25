import { Button } from "@/components/ui/button";
import { CircleDollarSign, CreditCard, Truck, Check } from "lucide-react";
import { Loader2 } from "lucide-react";

import type {
  OrderQueueActionContext,
  QueueActionState,
} from "@/features/orders/components/order-queue-action";

import type { Order } from "@/features/orders/types";
/** Store pickup: prepare, mark ready, hand over and collect payment. Returns undefined when it has no button, so the caller falls through. */
export function renderPickupQueueAction(
  ctx: OrderQueueActionContext,
  o: Order,
  state: QueueActionState,
) {
  const {
    isSubmittingCash,
    lang,
    setCashCollectedAmount,
    setCashModalNotes,
    setCashModalOrder,
    updatingOrderId,
  } = ctx;
  const { workflow, isPaid, isUpdating, isCod, handleStatusUpdate } = state;
  // B. STORE PICKUP WORKFLOW

  // 1. BenefitPay Manual Validation (Pickup)
  if (workflow.nextAction === "validate_payment") {
    return (
      <Button
        size="sm"
        className="h-8 text-xs px-3.5 bg-violet-600 hover:bg-violet-700 text-white font-bold shadow-2xs transition-all dark:bg-violet-700 dark:hover:bg-violet-800"
        disabled={updatingOrderId !== null}
        onClick={(e) => {
          e.stopPropagation();
          handleStatusUpdate(
            { payment_status: "paid", fulfillment_status: "READY_FOR_PICKUP" },
            lang === "ar"
              ? "تم تأكيد الدفع وتجهيز الطلب للاستلام!"
              : "Payment validated and pickup prepared!",
          );
        }}
      >
        {isUpdating ? (
          <Loader2 className="animate-spin h-3.5 w-3.5" />
        ) : (
          <span className="flex items-center gap-1.5">
            <CreditCard className="h-3.5 w-3.5" />
            {lang === "ar" ? "تأكيد وتجهيز" : "Validate & Prepare"}
          </span>
        )}
      </Button>
    );
  }

  // 2. Card / Paid Pickup Preparation
  if (workflow.nextAction === "prepare_pickup" && (isPaid || !isCod)) {
    return (
      <Button
        size="sm"
        className="h-8 text-xs px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold dark:bg-indigo-800 dark:hover:bg-indigo-900"
        disabled={updatingOrderId !== null}
        onClick={(e) => {
          e.stopPropagation();
          handleStatusUpdate(
            { fulfillment_status: "READY_FOR_PICKUP" },
            lang === "ar" ? "تم تحديد الطلب كجاهز للاستلام!" : "Order marked ready for pickup!",
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

  // 3. Pay at Store Preparation (Unpaid COD)
  if (workflow.nextAction === "prepare_pickup" && isCod && !isPaid) {
    return (
      <Button
        size="sm"
        className="h-8 text-xs px-3 bg-amber-600 hover:bg-amber-700 text-white font-semibold dark:bg-amber-800 dark:hover:bg-amber-900"
        disabled={updatingOrderId !== null}
        onClick={(e) => {
          e.stopPropagation();
          handleStatusUpdate(
            { fulfillment_status: "READY_FOR_PICKUP" },
            lang === "ar" ? "تم تجهيز الطلب للاستلام!" : "Order prepared!",
          );
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

  // 4. Pickup Handover
  if (
    workflow.nextAction === "hand_over_pickup" ||
    workflow.nextAction === "collect_and_hand_over"
  ) {
    if (workflow.nextAction === "collect_and_hand_over") {
      const totalAmt = Number(o.total || 0);
      const paidAmt = Number(o.advance_paid ?? 0);
      const remainingBal = Math.max(0, totalAmt - paidAmt);
      const isPartial = paidAmt > 0 && remainingBal > 0;
      return (
        <Button
          size="sm"
          className="h-8 bg-amber-500 px-3 text-xs font-semibold text-black hover:bg-amber-600"
          disabled={updatingOrderId !== null || isSubmittingCash}
          onClick={(e) => {
            e.stopPropagation();
            setCashModalOrder(o);
            setCashCollectedAmount(remainingBal.toFixed(3));
            setCashModalNotes("");
          }}
        >
          {isUpdating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : lang === "ar" ? (
            isPartial ? (
              "استلام المتبقي وتسليم الطلب"
            ) : (
              "استلام المبلغ وتسليم الطلب"
            )
          ) : isPartial ? (
            "Collect Balance & Hand Over"
          ) : (
            "Collect & Hand Over"
          )}
        </Button>
      );
    } else {
      return (
        <Button
          size="sm"
          className="h-8 text-xs px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold dark:bg-emerald-800 dark:hover:bg-emerald-900"
          disabled={updatingOrderId !== null}
          onClick={(e) => {
            e.stopPropagation();
            handleStatusUpdate(
              { fulfillment_status: "COMPLETED", status: "completed" },
              lang === "ar" ? "تم تسليم الطلب للعميل بالكامل!" : "Order handed over to customer!",
            );
          }}
        >
          {isUpdating ? (
            <Loader2 className="animate-spin h-3.5 w-3.5" />
          ) : lang === "ar" ? (
            "تسليم للعميل"
          ) : (
            "Hand Over"
          )}
        </Button>
      );
    }
  }
  return undefined;
}

/** Delivery: validate BenefitPay, assign a courier, dispatch and collect cash on delivery. Returns undefined when it has no button, so the caller falls through. */
export function renderDeliveryQueueAction(
  ctx: OrderQueueActionContext,
  o: Order,
  state: QueueActionState,
) {
  const {
    handleCompleteDelivery,
    isSubmittingCash,
    lang,
    setCashCollectedAmount,
    setCashModalNotes,
    setCashModalOrder,
    setFulfillNotes,
    setIsFulfillModalOpen,
    setSelectedCourierId,
    setSelectedFulfillOrder,
    setUpdatingOrderId,
    updatingOrderId,
  } = ctx;
  const { workflow, isPaid, isPartiallyPaid, isUpdating, isCod, handleStatusUpdate } = state;
  // A. DELIVERY WORKFLOW

  // 1. BenefitPay Manual Validation
  if (workflow.nextAction === "validate_payment") {
    return (
      <Button
        size="sm"
        className="h-8 text-xs px-3.5 bg-violet-600 hover:bg-violet-700 text-white font-bold shadow-2xs transition-all dark:bg-violet-700 dark:hover:bg-violet-800"
        disabled={updatingOrderId !== null}
        onClick={(e) => {
          e.stopPropagation();
          handleStatusUpdate(
            { payment_status: "paid" },
            lang === "ar" ? "تم تسجيل وتأكيد الدفع بنجاح!" : "Order payment marked as Paid!",
          );
        }}
      >
        {isUpdating ? (
          <Loader2 className="animate-spin h-3.5 w-3.5" />
        ) : (
          <span className="flex items-center gap-1.5">
            <CreditCard className="h-3.5 w-3.5" />
            {lang === "ar" ? "تأكيد الدفع" : "Validate Payment"}
          </span>
        )}
      </Button>
    );
  }

  // 2. Packing & Shipping (Card or Validated BenefitPay)
  if (workflow.nextAction === "pack_and_ship" && isPaid) {
    return (
      <Button
        size="sm"
        className="h-8 font-semibold bg-primary hover:bg-primary/90 text-primary-foreground text-xs px-3 shadow"
        disabled={updatingOrderId !== null}
        onClick={(e) => {
          e.stopPropagation();
          setSelectedFulfillOrder(o);
          setSelectedCourierId(o.assigned_to ?? "unassigned");
          setFulfillNotes(o.delivery_notes ?? "");
          setIsFulfillModalOpen(true);
        }}
      >
        {lang === "ar" ? "تعبئة وشحن" : "Fulfill / Pack"}
      </Button>
    );
  }

  // 3. COD Dispatch
  if (workflow.nextAction === "pack_and_ship" && isCod) {
    return (
      <Button
        size="sm"
        className="h-8 font-semibold bg-amber-500 hover:bg-amber-600 text-black text-xs px-3 shadow"
        disabled={updatingOrderId !== null}
        onClick={(e) => {
          e.stopPropagation();
          setSelectedFulfillOrder(o);
          setSelectedCourierId(o.assigned_to ?? "unassigned");
          setFulfillNotes(o.delivery_notes ?? "");
          setIsFulfillModalOpen(true);
        }}
      >
        {lang === "ar" ? "تجهيز وشحن COD" : "Pack & Ship COD"}
      </Button>
    );
  }

  // 3.5 Confirm Courier Pickup
  if (workflow.nextAction === "confirm_pickup") {
    return (
      <Button
        size="sm"
        className="h-8 font-semibold bg-sky-600 hover:bg-sky-700 text-white text-xs px-3 shadow"
        disabled={updatingOrderId !== null}
        onClick={(e) => {
          e.stopPropagation();
          setUpdatingOrderId(o.id);
          handleStatusUpdate(
            { fulfillment_status: "SHIPPED" },
            lang === "ar"
              ? "تم استلام الشحنة من المندوب وخرجت للتوصيل!"
              : "Courier picked up parcel - Out for Delivery!",
          );
        }}
      >
        {updatingOrderId === o.id ? (
          <Loader2 className="animate-spin h-3.5 w-3.5" />
        ) : (
          <span className="flex items-center gap-1">
            <Truck className="h-3.5 w-3.5" />
            {lang === "ar" ? "تأكيد استلام المندوب" : "Confirm Courier Pickup"}
          </span>
        )}
      </Button>
    );
  }

  // 4. Delivery Handover & Cash Collection Actions (Courier / Driver)
  if (workflow.nextAction === "mark_delivered" || workflow.nextAction === "collect_and_deliver") {
    const totalAmt = Number(o.total || 0);
    const paidAmt = Number(o.advance_paid ?? 0);
    const remainingBal = Math.max(0, totalAmt - paidAmt);

    if (workflow.nextAction === "mark_delivered") {
      return (
        <Button
          size="sm"
          className="h-8 font-semibold bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 shadow dark:bg-emerald-800 dark:hover:bg-emerald-900"
          disabled={updatingOrderId !== null || isSubmittingCash}
          onClick={(e) => {
            e.stopPropagation();
            handleCompleteDelivery(o, 0);
          }}
        >
          {isSubmittingCash && updatingOrderId === o.id ? (
            <Loader2 className="animate-spin h-3.5 w-3.5" />
          ) : (
            <span className="flex items-center gap-1">
              <Check className="h-3.5 w-3.5" />
              {lang === "ar" ? "تأكيد التسليم" : "Mark as Delivered"}
            </span>
          )}
        </Button>
      );
    }

    if (isPartiallyPaid || (paidAmt > 0 && remainingBal > 0)) {
      return (
        <Button
          size="sm"
          className="h-8 font-semibold bg-amber-500 hover:bg-amber-600 text-black text-xs px-3 shadow"
          disabled={updatingOrderId !== null || isSubmittingCash}
          onClick={(e) => {
            e.stopPropagation();
            setCashModalOrder(o);
            setCashCollectedAmount(remainingBal.toFixed(3));
            setCashModalNotes("");
          }}
        >
          <span className="flex items-center gap-1">
            <CircleDollarSign className="h-3.5 w-3.5" />
            {lang === "ar" ? "تحصيل المتبقي وتسليم" : "Collect Remaining & Complete"}
          </span>
        </Button>
      );
    }

    // Unpaid COD Order
    return (
      <Button
        size="sm"
        className="h-8 font-semibold bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 shadow dark:bg-emerald-800 dark:hover:bg-emerald-900"
        disabled={updatingOrderId !== null || isSubmittingCash}
        onClick={(e) => {
          e.stopPropagation();
          setCashModalOrder(o);
          setCashCollectedAmount(totalAmt.toFixed(3));
          setCashModalNotes("");
        }}
      >
        <span className="flex items-center gap-1">
          <CircleDollarSign className="h-3.5 w-3.5" />
          {lang === "ar" ? "تحصيل نقدًا وتسليم" : "Collect Cash & Complete"}
        </span>
      </Button>
    );
  }
  return undefined;
}
