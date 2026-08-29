import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
  RotateCcw,
  PackageCheck,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Wallet,
  CreditCard,
  ArrowLeftRight,
} from "lucide-react";
import { toast } from "sonner";
import {
  createReturnRequest,
  calculateReturnFinancials,
  checkOrderReturnEligibility,
} from "@/lib/returns.functions";
import { formatMoney } from "@/lib/format";
import {
  RETURN_REASONS,
  type BrandReturnPolicy,
  type CompensationMethod,
  type ReturnReasonCode,
} from "@/lib/returns.types";

interface CustomerReturnRequestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any;
  brandId: string;
  isAr: boolean;
  onSuccess: () => void;
}

interface SelectedReturnItem {
  orderItemId: string;
  quantity: number;
  maxQuantity: number;
  unitPrice: number;
  description: string;
  actionType: "return" | "exchange";
  selected: boolean;
}

export function CustomerReturnRequestModal({
  open,
  onOpenChange,
  order,
  brandId,
  isAr,
  onSuccess,
}: CustomerReturnRequestModalProps) {
  const [reasonCode, setReasonCode] = useState<ReturnReasonCode>("size_fit");
  const [reasonDetails, setReasonDetails] = useState("");
  const [preferredCompensation, setPreferredCompensation] =
    useState<CompensationMethod>("refund_original");
  const [submitting, setSubmitting] = useState(false);

  // Fetch brand return policy
  const { data: policy } = useQuery<BrandReturnPolicy>({
    queryKey: ["storefront-return-policy", brandId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("brand_return_policies")
        .select("*")
        .eq("brand_id", brandId)
        .maybeSingle();
      return (data as BrandReturnPolicy) || null;
    },
    enabled: open && !!brandId,
  });

  // Check eligibility
  const eligibility = checkOrderReturnEligibility(order || { created_at: new Date().toISOString(), status: "paid" }, policy);

  // Initialize selectable items
  const [items, setItems] = useState<SelectedReturnItem[]>([]);

  // Sync items when order changes
  useState(() => {
    if (order?.order_items) {
      setItems(
        order.order_items.map((it: any) => ({
          orderItemId: it.id,
          quantity: it.quantity,
          maxQuantity: it.quantity,
          unitPrice: Number(it.unit_price || 0),
          description: it.description || it.product?.name_ar || it.product?.name_en || "Product",
          actionType: "return",
          selected: true,
        })),
      );
    }
  });

  const selectedItems = items.filter((i) => i.selected && i.quantity > 0);

  const financials = calculateReturnFinancials({
    items: selectedItems.map((i) => ({ unitPrice: i.unitPrice, quantity: i.quantity })),
    order: {
      subtotal: Number(order?.subtotal || order?.total || 0),
      discount: Number(order?.discount || 0),
      taxAmount: Number(order?.tax_amount || 0),
      total: Number(order?.total || 0),
    },
    policy: policy || undefined,
  });

  const handleToggleItem = (index: number) => {
    const next = [...items];
    next[index].selected = !next[index].selected;
    setItems(next);
  };

  const handleUpdateItemQty = (index: number, qty: number) => {
    const next = [...items];
    const clamped = Math.max(1, Math.min(next[index].maxQuantity, qty));
    next[index].quantity = clamped;
    setItems(next);
  };

  const handleSubmit = async () => {
    if (selectedItems.length === 0) {
      toast.error(isAr ? "يرجى تحديد قطعة واحدة على الأقل للإرجاع" : "Please select at least one item");
      return;
    }

    setSubmitting(true);
    try {
      const res = await createReturnRequest({
        brandId,
        orderId: order.id,
        requestedBy: "customer",
        reason: isAr ? RETURN_REASONS[reasonCode]?.labelAr : RETURN_REASONS[reasonCode]?.labelEn,
        reasonDetails: reasonDetails.trim() || undefined,
        preferredCompensation,
        items: selectedItems.map((i) => ({
          order_item_id: i.orderItemId,
          quantity: i.quantity,
          action_type: i.actionType,
        })),
      });

      if (!res.success) {
        toast.error(res.error || (isAr ? "فشل تقديم طلب الإرجاع" : "Failed to submit return"));
        return;
      }

      toast.success(
        isAr
          ? `تم استلام طلب الإرجاع رقم ${res.returnNumber} وسيقوم الفريق بمراجعته`
          : `Return request ${res.returnNumber} submitted successfully`,
      );
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Error submitting return request");
    } finally {
      setSubmitting(false);
    }
  };

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <RotateCcw className="h-5 w-5 text-primary" />
            {isAr
              ? `تقديم طلب إرجاع / استبدال (فاتورة #${order.invoice_number})`
              : `Request Return / Exchange (Invoice #${order.invoice_number})`}
          </DialogTitle>
        </DialogHeader>

        {!eligibility.eligible ? (
          <div className="p-4 rounded-xl border border-destructive/20 bg-destructive/5 space-y-2 text-xs">
            <div className="flex items-center gap-2 text-destructive font-bold">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{isAr ? "الطلب غير مؤهل لتقديم طلب إرجاع" : "Order Not Eligible for Return"}</span>
            </div>
            <p className="text-muted-foreground">{eligibility.reason}</p>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Policy notice banner */}
            <div className="p-3 rounded-lg border border-border bg-muted/30 text-xs text-muted-foreground flex items-center justify-between">
              <span>
                {isAr
                  ? `فترة السماح: ${policy?.return_window_days ?? 14} يوماً من الشراء`
                  : `Return Window: ${policy?.return_window_days ?? 14} days from purchase`}
              </span>
              {policy?.customer_shipping_fee_borne_by === "customer" && Number(policy.return_shipping_fee) > 0 && (
                <span className="font-mono">
                  {isAr ? "رسوم الشحن:" : "Shipping Fee:"}{" "}
                  {formatMoney(Number(policy.return_shipping_fee), "BHD", isAr ? "ar-BH-u-nu-latn" : "en-US")}
                </span>
              )}
            </div>

            {/* Select items */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-foreground">
                {isAr ? "اختر القطع المراد إرجاعها أو استبدالها" : "Select Items to Return or Exchange"}
              </Label>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {items.map((item, idx) => (
                  <div
                    key={item.orderItemId}
                    className={`p-3 rounded-lg border text-xs flex items-center justify-between gap-3 transition-colors ${
                      item.selected
                        ? "border-primary/40 bg-primary/5"
                        : "border-border bg-background opacity-60"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={() => handleToggleItem(idx)}
                        className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                      />
                      <div>
                        <h4 className="font-bold text-foreground">{item.description}</h4>
                        <span className="text-[11px] font-mono text-muted-foreground">
                          {formatMoney(item.unitPrice, "BHD", isAr ? "ar-BH-u-nu-latn" : "en-US")}
                        </span>
                      </div>
                    </div>

                    {item.selected && (
                      <div className="flex items-center gap-2">
                        <Label className="text-[11px] text-muted-foreground">{isAr ? "الكمية:" : "Qty:"}</Label>
                        <Input
                          type="number"
                          min={1}
                          max={item.maxQuantity}
                          value={item.quantity}
                          onChange={(e) =>
                            handleUpdateItemQty(idx, parseInt(e.target.value, 10) || 1)
                          }
                          className="h-7 w-16 text-xs font-mono"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Reason */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">
                {isAr ? "سبب الإرجاع" : "Reason for Return"}
              </Label>
              <Select
                value={reasonCode}
                onValueChange={(val) => setReasonCode(val as ReturnReasonCode)}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(RETURN_REASONS) as ReturnReasonCode[]).map((r) => (
                    <SelectItem key={r} value={r} className="text-xs">
                      {isAr ? RETURN_REASONS[r].labelAr : RETURN_REASONS[r].labelEn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Reason details */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">
                {isAr ? "تفاصيل إضافية (اختياري)" : "Additional Details (Optional)"}
              </Label>
              <Textarea
                placeholder={
                  isAr
                    ? "يرجى ذكر أي ملاحظات إضافية حول سبب الإرجاع لمساعدتنا في خدمتك بشكل أفضل..."
                    : "Please describe the issue in more detail..."
                }
                value={reasonDetails}
                onChange={(e) => setReasonDetails(e.target.value)}
                className="text-xs min-h-[60px]"
              />
            </div>

            {/* Preferred Compensation */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">
                {isAr ? "طريقة التعويض المفضلة" : "Preferred Compensation"}
              </Label>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPreferredCompensation("refund_original")}
                  className={
                    preferredCompensation === "refund_original"
                      ? "h-9 text-xs font-semibold bg-primary/10 border-primary/30 text-primary"
                      : "h-9 text-xs border-border text-muted-foreground"
                  }
                >
                  <CreditCard className="h-3.5 w-3.5 me-1" />
                  {isAr ? "استرداد مالي" : "Refund"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPreferredCompensation("store_credit")}
                  className={
                    preferredCompensation === "store_credit"
                      ? "h-9 text-xs font-semibold bg-primary/10 border-primary/30 text-primary"
                      : "h-9 text-xs border-border text-muted-foreground"
                  }
                >
                  <Wallet className="h-3.5 w-3.5 me-1" />
                  {isAr ? "رصيد متجر" : "Store Credit"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPreferredCompensation("exchange")}
                  className={
                    preferredCompensation === "exchange"
                      ? "h-9 text-xs font-semibold bg-primary/10 border-primary/30 text-primary"
                      : "h-9 text-xs border-border text-muted-foreground"
                  }
                >
                  <ArrowLeftRight className="h-3.5 w-3.5 me-1" />
                  {isAr ? "استبدال" : "Exchange"}
                </Button>
              </div>
            </div>

            {/* Live Financial Breakdown */}
            <div className="p-3 rounded-lg border border-border bg-muted/20 text-xs space-y-1.5 font-mono">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>{isAr ? "قيمة المنتجات المحددة:" : "Items Subtotal:"}</span>
                <span>{formatMoney(financials.totalItemRefund, "BHD", isAr ? "ar-BH-u-nu-latn" : "en-US")}</span>
              </div>
              {financials.proRatedDiscount > 0 && (
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>{isAr ? "خصم مستقطع:" : "Discount Deducted:"}</span>
                  <span className="text-destructive">-{formatMoney(financials.proRatedDiscount, "BHD", isAr ? "ar-BH-u-nu-latn" : "en-US")}</span>
                </div>
              )}
              {financials.returnFee > 0 && (
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>{isAr ? "رسوم الشحن:" : "Return Fee:"}</span>
                  <span className="text-destructive">-{formatMoney(financials.returnFee, "BHD", isAr ? "ar-BH-u-nu-latn" : "en-US")}</span>
                </div>
              )}
              <div className="pt-1.5 border-t border-border flex items-center justify-between font-bold text-sm text-foreground">
                <span>{isAr ? "صافي المستحق المقدر:" : "Estimated Refund:"}</span>
                <span className="text-emerald-600 dark:text-emerald-400">
                  {formatMoney(financials.netRefundAmount, "BHD", isAr ? "ar-BH-u-nu-latn" : "en-US")}
                </span>
              </div>
            </div>
          </div>
        )}

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
          {eligibility.eligible && (
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handleSubmit}
              disabled={submitting || selectedItems.length === 0}
              className="h-9 text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isAr ? "إرسال طلب الإرجاع" : "Submit Return Request"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
