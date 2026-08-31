import React, { useState, useEffect } from "react";
import { CreditCard, CheckCircle2, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatMoney } from "@/lib/format";
import {
  PAYMENT_BADGE_CLASSES,
  PAYMENT_BADGE_LABEL,
  type PaymentBadge,
} from "@/lib/payment-status";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ManagePaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lang: "en" | "ar";
  currency: string;
  order: any;
  totals: {
    total: number;
    advancePaid: number;
    balanceDue: number;
  };
  onSavePayment: (updatedFields: {
    payment_status: PaymentBadge;
    payment_method: string;
    advance_paid: number;
    payment_reference?: string;
  }) => Promise<void> | void;
}

export const ManagePaymentModal: React.FC<ManagePaymentModalProps> = ({
  open,
  onOpenChange,
  lang,
  currency,
  order,
  totals,
  onSavePayment,
}) => {
  const isAr = lang === "ar";

  const [paymentStatus, setPaymentStatus] = useState<PaymentBadge>("unpaid");
  const [paymentMethod, setPaymentMethod] = useState<string>("cod");
  const [advanceAmount, setAdvanceAmount] = useState<string>("0");
  const [paymentRef, setPaymentRef] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const parsedAdvance = Math.max(0, Number(advanceAmount) || 0);
  const originalStatus = ((order?.payment_status as PaymentBadge) || "unpaid") as PaymentBadge;
  const originalMethod = order?.payment_method || "cod";
  const originalAdvance = Number(order?.advance_paid ?? totals.advancePaid ?? 0);
  const originalReference =
    order?.payment_reference || order?.gateway_reference || order?.benefit_receipt_key || "";
  const hasChanges =
    paymentStatus !== originalStatus ||
    paymentMethod !== originalMethod ||
    parsedAdvance !== originalAdvance ||
    paymentRef.trim() !== String(originalReference).trim();

  useEffect(() => {
    if (order && open) {
      setPaymentStatus((order.payment_status as PaymentBadge) || "unpaid");
      setPaymentMethod(order.payment_method || "cod");
      setAdvanceAmount(String(order.advance_paid ?? totals.advancePaid ?? 0));
      setPaymentRef(
        order.payment_reference || order.gateway_reference || order.benefit_receipt_key || "",
      );
    }
  }, [order, open, totals.advancePaid]);

  const handleQuickPreset = (status: PaymentBadge) => {
    setPaymentStatus(status);
    if (status === "paid") {
      setAdvanceAmount(String(totals.total));
    } else if (status === "unpaid") {
      setAdvanceAmount("0");
    } else if (status === "partial" && Number(advanceAmount) === 0) {
      setAdvanceAmount(String((totals.total / 2).toFixed(3)));
    }
  };

  const handleSave = async () => {
    if (!hasChanges) return;
    if (parsedAdvance > totals.total) {
      toast.error(
        isAr
          ? "المبلغ المستلم لا يمكن أن يتجاوز إجمالي الطلب"
          : "Collected amount cannot exceed the order total",
      );
      return;
    }
    if (paymentStatus === "paid" && parsedAdvance < totals.total) {
      toast.error(
        isAr
          ? "اختر مدفوع جزئيًا إذا كان المبلغ المستلم أقل من إجمالي الطلب"
          : "Use Partially Paid when the collected amount is below the order total",
      );
      return;
    }
    setSaving(true);
    try {
      await onSavePayment({
        payment_status: paymentStatus,
        payment_method: paymentMethod,
        advance_paid: parsedAdvance,
        payment_reference: paymentRef.trim(),
      });
      toast.success(
        isAr ? "تم تحديث حالة وبيانات الدفع بنجاح" : "Payment details updated successfully",
      );
      onOpenChange(false);
    } catch (err: any) {
      toast.error(
        err?.message ||
          (isAr ? "حدث خطأ أثناء تحديث حالة الدفع" : "Failed to update payment details"),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md gap-4 rounded-2xl border-border/80 p-5 shadow-xl">
        <DialogHeader className="space-y-1.5 border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
              <CreditCard className="h-4 w-4" />
            </div>
            <DialogTitle className="text-base font-extrabold font-display">
              {isAr ? "إدارة عمليات وتسوية الدفع" : "Manage Order Payment Lifecycle"}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            {isAr
              ? "تعديل حالة الدفع، طريقة التحصيل، تسجيل العربون، ورقم المرجع."
              : "Update payment status, collection channel, advance amount, and reference ID."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-xs py-1">
          {/* Status Quick Presets */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-foreground">
              {isAr ? "حالة الدفع" : "Payment Status"}
            </Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(["unpaid", "partial", "paid", "refunded"] as PaymentBadge[]).map((st) => {
                const isActive = paymentStatus === st;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => handleQuickPreset(st)}
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-xl border px-2.5 py-2 text-xs font-bold transition-all touch-manipulation",
                      isActive
                        ? `${PAYMENT_BADGE_CLASSES[st]} ring-2 ring-primary/30 shadow-2xs`
                        : "bg-muted/30 border-border/70 text-muted-foreground hover:text-foreground hover:bg-muted/60",
                    )}
                  >
                    <span>{PAYMENT_BADGE_LABEL[st]?.[lang]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Payment Method Select */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-foreground">
              {isAr ? "طريقة / وسيلة الدفع" : "Payment Channel / Method"}
            </Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger className="h-9 rounded-xl border-border/80 text-xs font-medium bg-background">
                <SelectValue placeholder={isAr ? "اختر طريقة الدفع" : "Select Payment Method"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cod">
                  💵 {isAr ? "الدفع عند الاستلام (COD)" : "Cash on Delivery (COD)"}
                </SelectItem>
                <SelectItem value="card">
                  💳 {isAr ? "بطاقة ائتمانية / خصم" : "Credit / Debit Card"}
                </SelectItem>
                <SelectItem value="benefit">
                  📲 {isAr ? "تطبيق بنفت باي (BenefitPay)" : "BenefitPay"}
                </SelectItem>
                <SelectItem value="tap">
                  💳 {isAr ? "بوابة تاب للدفع (Tap Gateway)" : "Tap Payment Gateway"}
                </SelectItem>
                <SelectItem value="bank_transfer">
                  🏛️ {isAr ? "تحويل بنكي مباشر" : "Bank Transfer"}
                </SelectItem>
                <SelectItem value="cash">
                  💶 {isAr ? "نقداً في المحل (Cash)" : "Cash at Counter"}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Custom Amount / Advance Paid */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold text-foreground">
                {isAr ? "المبلغ المستلم / العربون" : "Collected / Advance Amount"}
              </Label>
              <span className="text-[11px] font-mono text-muted-foreground">
                {isAr ? "الإجمالي:" : "Total:"} {formatMoney(totals.total, currency, lang)}
              </span>
            </div>
            <div className="relative">
              <Input
                type="number"
                step="0.001"
                min="0"
                value={advanceAmount}
                onChange={(e) => setAdvanceAmount(e.target.value)}
                className="h-9 rounded-xl border-border/80 font-mono text-xs pe-12 bg-background font-bold text-foreground"
              />
              <span className="absolute end-3 top-2 text-[11px] font-mono font-bold text-muted-foreground">
                {currency}
              </span>
            </div>
          </div>

          {/* Transaction / Reference ID */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-foreground">
              {isAr ? "رقم مرجع المعاملة / الإيصال" : "Transaction / Gateway Reference ID"}
            </Label>
            <div className="relative">
              <Input
                type="text"
                placeholder={
                  isAr ? "مثال: TAP_CHG_981273 أو رقم الإيصال" : "e.g. TAP_CHG_981273 or Ref #"
                }
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
                className="h-9 rounded-xl border-border/80 font-mono text-xs bg-background"
              />
            </div>
          </div>

          {hasChanges && (
            <div className="space-y-2 rounded-xl border border-amber-300/70 bg-amber-50/80 p-3 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
              <p className="font-bold">
                {isAr ? "راجع التغييرات قبل التأكيد" : "Review changes before confirming"}
              </p>
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-[11px]">
                <span className="truncate">
                  {PAYMENT_BADGE_LABEL[originalStatus]?.[lang]} ·{" "}
                  {formatMoney(originalAdvance, currency, lang)}
                </span>
                <span aria-hidden="true">→</span>
                <span className="truncate font-bold">
                  {PAYMENT_BADGE_LABEL[paymentStatus]?.[lang]} ·{" "}
                  {formatMoney(parsedAdvance, currency, lang)}
                </span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0 border-t border-border/60 pt-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="h-9 rounded-xl text-xs font-semibold"
          >
            {isAr ? "إلغاء" : "Cancel"}
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="h-9 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 shadow-2xs gap-1.5"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            <span>{isAr ? "تأكيد وتحديث الدفع" : "Confirm & Save Payment"}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
