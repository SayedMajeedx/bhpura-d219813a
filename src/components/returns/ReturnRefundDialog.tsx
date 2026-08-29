import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CircleDollarSign,
  Wallet,
  CreditCard,
  Building2,
  Banknote,
  Loader2,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { processReturnRefund } from "@/lib/returns.functions";
import { formatMoney } from "@/lib/format";
import type { ReturnRequest } from "@/lib/returns.types";

interface ReturnRefundDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnReq: ReturnRequest;
  brandId: string;
  lang: "en" | "ar";
  onSuccess: () => void;
}

export function ReturnRefundDialog({
  open,
  onOpenChange,
  returnReq,
  brandId,
  lang,
  onSuccess,
}: ReturnRefundDialogProps) {
  const isAr = lang === "ar";
  const [refundMethod, setRefundMethod] = useState<string>(
    returnReq.preferred_compensation === "store_credit" ? "store_credit" : "original_payment",
  );
  const [refundAmount, setRefundAmount] = useState<string>(
    String(returnReq.net_refund_amount || 0),
  );
  const [refundReference, setRefundReference] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const totalPaid =
    Number(returnReq.order?.advance_paid || 0) > 0
      ? Number(returnReq.order?.advance_paid)
      : Number(returnReq.order?.total || 0);

  const numRefundAmount = parseFloat(refundAmount) || 0;
  const isExceeding = numRefundAmount > totalPaid;

  const handleProcess = async () => {
    if (numRefundAmount <= 0) {
      toast.error(isAr ? "يرجى إدخال مبلغ استرداد صحيح" : "Please enter a valid refund amount");
      return;
    }

    if (isExceeding) {
      toast.error(
        isAr
          ? "مبلغ الاسترداد يتجاوز إجمالي ما دفعه العميل في الطلب"
          : "Refund amount exceeds total paid on the order",
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await processReturnRefund({
        brandId,
        returnId: returnReq.id,
        refundMethod,
        refundAmount: numRefundAmount,
        refundReference: refundReference.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      if (!res.success) {
        toast.error(res.error || (isAr ? "فشل تنفيذ الاسترداد المالي" : "Failed to process refund"));
        return;
      }

      toast.success(
        isAr
          ? `تم تنفيذ الاسترداد بمبلغ ${formatMoney(numRefundAmount, "BHD", "ar-BH-u-nu-latn")} بنجاح`
          : `Refund of ${formatMoney(numRefundAmount, "BHD", "en-US")} processed successfully`,
      );
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Error processing refund");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <CircleDollarSign className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            {isAr ? "معالجة الاسترداد المالي والتعويض" : "Process Return Refund"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Financial Summary Card */}
          <div className="p-3.5 rounded-xl border border-border bg-muted/30 space-y-2 text-xs">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>{isAr ? "قيمة البنود المرتجعة:" : "Items Total:"}</span>
              <span className="font-mono font-medium text-foreground">
                {formatMoney(Number(returnReq.total_item_refund || 0), "BHD", isAr ? "ar-BH-u-nu-latn" : "en-US")}
              </span>
            </div>

            {Number(returnReq.pro_rated_discount_deduction || 0) > 0 && (
              <div className="flex items-center justify-between text-muted-foreground">
                <span>{isAr ? "خصم ترويجي موزع مستقطع:" : "Pro-rated Discount:"}</span>
                <span className="font-mono text-destructive">
                  -{formatMoney(Number(returnReq.pro_rated_discount_deduction || 0), "BHD", isAr ? "ar-BH-u-nu-latn" : "en-US")}
                </span>
              </div>
            )}

            {Number(returnReq.tax_refund || 0) > 0 && (
              <div className="flex items-center justify-between text-muted-foreground">
                <span>{isAr ? "استرداد ضريبة القيمة المضافة:" : "Tax Refund (VAT):"}</span>
                <span className="font-mono text-foreground">
                  +{formatMoney(Number(returnReq.tax_refund || 0), "BHD", isAr ? "ar-BH-u-nu-latn" : "en-US")}
                </span>
              </div>
            )}

            {Number(returnReq.return_fee || 0) > 0 && (
              <div className="flex items-center justify-between text-muted-foreground">
                <span>{isAr ? "رسوم شحن الإرجاع المستقطعة:" : "Return Shipping Fee:"}</span>
                <span className="font-mono text-destructive">
                  -{formatMoney(Number(returnReq.return_fee || 0), "BHD", isAr ? "ar-BH-u-nu-latn" : "en-US")}
                </span>
              </div>
            )}

            <div className="pt-2 border-t border-border flex items-center justify-between font-bold text-sm">
              <span className="text-foreground">{isAr ? "صافي المستحق للاسترداد:" : "Net Refund Amount:"}</span>
              <span className="font-mono text-emerald-600 dark:text-emerald-400">
                {formatMoney(Number(returnReq.net_refund_amount || 0), "BHD", isAr ? "ar-BH-u-nu-latn" : "en-US")}
              </span>
            </div>
          </div>

          {/* Refund Method Selector */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground">
              {isAr ? "طريقة التعويض / الاسترداد" : "Compensation & Refund Method"}
            </Label>
            <Select value={refundMethod} onValueChange={setRefundMethod}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="original_payment" className="text-xs">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-3.5 w-3.5 text-primary" />
                    <span>{isAr ? "طريقة الدفع الأصلية (بطاقة / بنفت)" : "Original Payment Method"}</span>
                  </div>
                </SelectItem>
                <SelectItem value="store_credit" className="text-xs">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>{isAr ? "رصيد متجر (إيداع فوري في محفظة العميل)" : "Store Credit Wallet"}</span>
                  </div>
                </SelectItem>
                <SelectItem value="cash" className="text-xs">
                  <div className="flex items-center gap-2">
                    <Banknote className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                    <span>{isAr ? "نقداً (تسليم يدوي)" : "Cash Payout"}</span>
                  </div>
                </SelectItem>
                <SelectItem value="bank_transfer" className="text-xs">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                    <span>{isAr ? "تحويل بنكي مباشر (IBAN)" : "Direct Bank Transfer"}</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Refund Amount Input with Max Cap Indicator */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-foreground">
                {isAr ? "مبلغ الاسترداد الفعلي (د.ب)" : "Refund Amount (BHD)"}
              </Label>
              <span className="text-[11px] text-muted-foreground font-mono">
                {isAr ? "سقف المدفوع:" : "Paid Cap:"} {formatMoney(totalPaid, "BHD", isAr ? "ar-BH-u-nu-latn" : "en-US")}
              </span>
            </div>
            <Input
              type="number"
              step="0.001"
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
              className="h-9 text-xs font-mono"
            />
            {isExceeding && (
              <div className="flex items-center gap-1.5 text-xs text-destructive mt-1">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{isAr ? "لا يمكن استرداد أكثر من المبلغ المدفوع في الطلب" : "Cannot exceed paid order total"}</span>
              </div>
            )}
          </div>

          {/* Reference */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground">
              {isAr ? "المرجع المالي / رقم الإيصال (اختياري)" : "Payment / Gateway Reference (Optional)"}
            </Label>
            <Input
              placeholder={isAr ? "مثال: TAP_REF_89324 أو رقم الحوالة..." : "e.g., TAP_REF_89324"}
              value={refundReference}
              onChange={(e) => setRefundReference(e.target.value)}
              className="h-9 text-xs"
            />
          </div>

          {/* Ledger Notice */}
          <div className="p-3 rounded-lg border border-border bg-background text-[11px] text-muted-foreground flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
            <span>
              {isAr
                ? "سيتم تسجيل القيد المحاسبي المزدوج آلياً في دفتر الأستاذ العام وسجل النشاط."
                : "Double-entry journal lines will be automatically recorded in the general ledger."}
            </span>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="h-9 text-xs"
          >
            {isAr ? "إلغاء" : "Cancel"}
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleProcess}
            disabled={submitting || isExceeding || numRefundAmount <= 0}
            className="h-9 text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isAr ? "تأكيد وصرف الاسترداد" : "Confirm & Process Refund"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
