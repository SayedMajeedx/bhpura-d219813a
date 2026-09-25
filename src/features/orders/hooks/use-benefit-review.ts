import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { rejectBenefitReceipt } from "@/lib/benefit-receipt.functions";
import type { OrderDetailData } from "@/features/orders/hooks/use-order-detail-data";
import {
  approveBenefitPayment as approveBenefitTransfer,
  invalidateOrders,
} from "@/lib/data/orders";

/** Approving or rejecting a BenefitPay transfer receipt the customer uploaded. */
export function useBenefitReview({
  id,
  brandId,
  lang,
  orderQ,
}: {
  id: string;
  brandId: string;
  lang: string;
  orderQ: OrderDetailData["orderQ"];
}) {
  const qc = useQueryClient();
  const [approvingBenefit, setApprovingBenefit] = useState(false);
  const [rejectingBenefit, setRejectingBenefit] = useState(false);
  const [rejectReasonOpen, setRejectReasonOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const approveBenefitPayment = async () => {
    setApprovingBenefit(true);
    try {
      await approveBenefitTransfer(id);

      await orderQ.refetch();
      invalidateOrders(qc, brandId);
      toast.success(
        lang === "ar" ? "تم التحقق من الدفع واعتماده" : "Payment verified and approved",
      );
    } catch (error: any) {
      toast.error(
        error?.message ?? (lang === "ar" ? "تعذر اعتماد الدفع" : "Could not approve payment"),
      );
    } finally {
      setApprovingBenefit(false);
    }
  };

  const rejectBenefitPayment = async () => {
    const reason = rejectReason.trim();
    if (reason.length < 3) {
      toast.error(
        lang === "ar"
          ? "يرجى إدخال سبب الرفض ليظهر للعميل"
          : "Enter a rejection reason for the customer",
      );
      return;
    }
    setRejectingBenefit(true);
    try {
      await rejectBenefitReceipt({ data: { orderId: id, reason } });
      toast.success(
        lang === "ar" ? "تم رفض الإيصال وحذف الصورة" : "Receipt rejected and image deleted",
      );
      await orderQ.refetch();
      qc.removeQueries({ queryKey: ["benefit-receipt-view", id] });
      invalidateOrders(qc, brandId);
      setRejectReasonOpen(false);
      setRejectReason("");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : lang === "ar"
            ? "تعذر رفض الإيصال"
            : "Unable to reject receipt",
      );
    } finally {
      setRejectingBenefit(false);
    }
  };

  return {
    approvingBenefit,
    rejectingBenefit,
    rejectReasonOpen,
    setRejectReasonOpen,
    rejectReason,
    setRejectReason,
    approveBenefitPayment,
    rejectBenefitPayment,
  };
}
