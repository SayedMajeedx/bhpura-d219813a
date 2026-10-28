import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, CheckCircle2, ImageIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n";
import type { Order } from "@/features/orders/types";
import { useBenefitReview } from "@/features/orders/hooks/use-benefit-review";
import type { OrderDetailData } from "@/features/orders/hooks/use-order-detail-data";
import { transferApproved } from "@/features/orders/lib/transfer-approval";
import type { ExpectedAdvance } from "@/features/orders/lib/expected-advance";
import { formatMoney } from "@/lib/format";

/** BenefitPay transfer receipt: view it, approve the payment or reject it with a reason. */
export function BenefitReceiptReview({
  currency,
  expected,
  approveBenefitPayment,
  approvingBenefit,
  lang,
  order,
  receiptViewQ,
  rejectBenefitPayment,
  rejectReason,
  rejectReasonOpen,
  rejectingBenefit,
  setRejectReason,
  setRejectReasonOpen,
}: {
  currency: string;
  /** What the transfer should pay now, from the order's advance rule; null for a plain order. */
  expected: ExpectedAdvance | null;
  approveBenefitPayment: ReturnType<typeof useBenefitReview>["approveBenefitPayment"];
  approvingBenefit: ReturnType<typeof useBenefitReview>["approvingBenefit"];
  lang: ReturnType<typeof useI18n>["lang"];
  order: Order;
  receiptViewQ: OrderDetailData["receiptViewQ"];
  rejectBenefitPayment: ReturnType<typeof useBenefitReview>["rejectBenefitPayment"];
  rejectReason: ReturnType<typeof useBenefitReview>["rejectReason"];
  rejectReasonOpen: ReturnType<typeof useBenefitReview>["rejectReasonOpen"];
  rejectingBenefit: ReturnType<typeof useBenefitReview>["rejectingBenefit"];
  setRejectReason: ReturnType<typeof useBenefitReview>["setRejectReason"];
  setRejectReasonOpen: ReturnType<typeof useBenefitReview>["setRejectReasonOpen"];
}) {
  // Approved in full, or for the advance (the balance is collected on delivery). Either way the
  // receipt was accepted: it is not approved again, and above all not rejected, which would
  // cancel an order whose payment was taken.
  const approved = transferApproved(order.payment_status);
  const advanceOnly = approved && order.payment_status !== "paid";
  return (
    <div
      className={
        approved
          ? "rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-emerald-950"
          : "rounded-xl border-2 border-amber-300 bg-amber-50 p-4 text-amber-950"
      }
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-5 w-5" />
          <span className="font-semibold">
            {lang === "ar" ? "إيصال تحويل بنفت" : "Benefit transfer receipt"}
          </span>
        </div>
        <span
          className={`rounded-full px-2 py-1 text-xs font-semibold ${approved ? "bg-emerald-100 text-emerald-800" : "bg-amber-200 text-amber-900"}`}
        >
          {approved
            ? advanceOnly
              ? lang === "ar"
                ? "تم التحقق من العربون"
                : "Advance verified"
              : lang === "ar"
                ? "تم التحقق"
                : "Verified"
            : lang === "ar"
              ? "بانتظار التحقق"
              : "Pending verification"}
        </span>
      </div>
      {receiptViewQ.isLoading ? (
        <div className="flex h-52 items-center justify-center rounded-lg border bg-white">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : receiptViewQ.data?.url ? (
        <a
          href={receiptViewQ.data.url}
          target="_blank"
          rel="noreferrer"
          className="block overflow-hidden rounded-lg border bg-white"
        >
          <img
            src={receiptViewQ.data.url}
            alt="Benefit payment receipt"
            className="h-52 w-full object-contain"
          />
        </a>
      ) : (
        <div className="rounded-lg border bg-white p-5 text-center text-sm text-muted-foreground">
          {order.benefit_receipt_deleted_at
            ? lang === "ar"
              ? "تم حذف صورة الإيصال حسب سياسة الاحتفاظ."
              : "Receipt image removed under the retention policy."
            : lang === "ar"
              ? "تعذر تحميل صورة الإيصال الخاصة."
              : "The private receipt could not be loaded."}
        </div>
      )}
      {expected && !approved && (
        <p className="mt-3 rounded-lg bg-white/70 px-3 py-2 text-sm font-semibold">
          {lang === "ar"
            ? `المبلغ المتوقع في الإيصال: ${formatMoney(expected.split.dueNow, currency, lang)}`
            : `Amount the receipt should show: ${formatMoney(expected.split.dueNow, currency, lang)}`}
          {!expected.payInFull &&
            (lang === "ar"
              ? ` · المتبقي ${formatMoney(expected.split.balance, currency, lang)}`
              : ` · ${formatMoney(expected.split.balance, currency, lang)} stays due`)}
        </p>
      )}
      {!approved && (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button
            type="button"
            className="bg-emerald-700 text-white hover:bg-emerald-800"
            onClick={approveBenefitPayment}
            disabled={approvingBenefit || rejectingBenefit}
          >
            {approvingBenefit ? (
              <Loader2 className="me-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="me-2 h-4 w-4" />
            )}
            {lang === "ar" ? "اعتماد الدفع" : "Approve Payment"}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => setRejectReasonOpen(true)}
            disabled={approvingBenefit || rejectingBenefit}
          >
            {rejectingBenefit && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            {lang === "ar" ? "رفض الإيصال" : "Reject Receipt"}
          </Button>
        </div>
      )}
      <Dialog
        open={rejectReasonOpen}
        onOpenChange={(open) => {
          setRejectReasonOpen(open);
          if (!open) setRejectReason("");
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {lang === "ar" ? "رفض إيصال بنفت باي" : "Reject BenefitPay receipt"}
            </DialogTitle>
            <DialogDescription>
              {lang === "ar"
                ? "سيُرسل سبب الرفض للعميل، وستُحذف صورة الإيصال الخاصة فوراً."
                : "The reason will be emailed to the customer and the private receipt image will be deleted immediately."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="benefit-rejection-reason">
              {lang === "ar" ? "سبب الرفض" : "Rejection reason"}
            </Label>
            <Textarea
              id="benefit-rejection-reason"
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              maxLength={500}
              dir={lang === "ar" ? "rtl" : "ltr"}
              placeholder={
                lang === "ar"
                  ? "مثال: الإيصال غير واضح أو لا يطابق مبلغ الطلب"
                  : "For example: receipt is unclear or does not match the order amount"
              }
            />
            <p className="text-xs text-muted-foreground">{rejectReason.trim().length}/500</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRejectReasonOpen(false)}>
              {lang === "ar" ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={rejectBenefitPayment}
              disabled={rejectingBenefit || rejectReason.trim().length < 3}
            >
              {rejectingBenefit && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {lang === "ar" ? "رفض الإيصال وإرسال السبب" : "Reject and notify customer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
