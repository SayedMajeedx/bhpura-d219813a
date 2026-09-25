import { Button } from "@/components/ui/button";
import { CircleDollarSign } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/format";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { getOrderCustomerName } from "@/lib/order-customer-snapshot";

import type { Dispatch, SetStateAction } from "react";

import type { Order } from "@/features/orders/types";
/** Confirm the cash a courier collected on delivery and complete the order. */
export function CashCollectionModal({
  cashCollectedInput,
  cashModalNotes,
  cashModalOrder,
  handleCompleteDelivery,
  isSubmittingCash,
  lang,
  locale,
  setCashCollectedAmount,
  setCashModalNotes,
  setCashModalOrder,
}: {
  cashCollectedInput: string;
  cashModalNotes: string;
  cashModalOrder: Order | null;
  handleCompleteDelivery: (
    order: Order,
    amountToCollect: number,
    notes?: string,
  ) => Promise<unknown>;
  isSubmittingCash: boolean;
  lang: ReturnType<typeof useI18n>["lang"];
  locale: string;
  setCashCollectedAmount: Dispatch<SetStateAction<string>>;
  setCashModalNotes: Dispatch<SetStateAction<string>>;
  setCashModalOrder: Dispatch<SetStateAction<any | null>>;
}) {
  return (
    <Dialog
      open={Boolean(cashModalOrder)}
      onOpenChange={(open) => {
        if (!open) setCashModalOrder(null);
      }}
    >
      <DialogContent
        className="max-w-[calc(100vw-2rem)] sm:max-w-md bg-background border rounded-2xl shadow-xl"
        dir={lang === "ar" ? "rtl" : "ltr"}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <CircleDollarSign className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            {lang === "ar" ? "تأكيد تحصيل المبلغ والتسليم" : "Confirm Cash & Delivery"}
          </DialogTitle>
        </DialogHeader>

        {cashModalOrder && (
          <div className="space-y-4 py-2">
            <div className="rounded-xl bg-muted/60 border p-3.5 space-y-1.5 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">
                  {lang === "ar" ? "رقم الفاتورة / الطلب:" : "Invoice / Order #"}
                </span>
                <span className="font-mono font-bold text-primary">
                  #{cashModalOrder.invoice_number || cashModalOrder.id.slice(0, 8)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">
                  {lang === "ar" ? "العميل:" : "Customer:"}
                </span>
                <span className="font-semibold">
                  {getOrderCustomerName(cashModalOrder) || (lang === "ar" ? "عميل" : "Customer")}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">
                  {lang === "ar" ? "إجمالي الطلب:" : "Total Amount:"}
                </span>
                <span className="font-semibold">
                  {formatMoney(
                    Number(cashModalOrder.total),
                    cashModalOrder.currency ?? "BHD",
                    locale,
                  )}
                </span>
              </div>
              <div className="flex justify-between items-center text-emerald-700 dark:text-emerald-400 font-bold border-t pt-2 mt-1">
                <span>{lang === "ar" ? "المبلغ المتبقي للتحصيل:" : "Remaining Balance:"}</span>
                <span className="text-base font-extrabold">
                  {formatMoney(
                    Math.max(
                      0,
                      Number(cashModalOrder.total) - Number(cashModalOrder.advance_paid ?? 0),
                    ),
                    cashModalOrder.currency ?? "BHD",
                    locale,
                  )}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-foreground block">
                {lang === "ar" ? "المبلغ المستلم نقداً (د.ب)" : "Cash Amount Received (BHD)"}
              </label>
              <Input
                type="number"
                step="0.001"
                min="0"
                value={cashCollectedInput}
                onChange={(e) => setCashCollectedAmount(e.target.value)}
                placeholder="0.000"
                className="font-mono text-lg font-extrabold h-11 border-emerald-300 focus:border-emerald-500 dark:border-emerald-800"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground block">
                {lang === "ar" ? "ملاحظات التوصيل (اختياري)" : "Delivery Notes (Optional)"}
              </label>
              <Input
                value={cashModalNotes}
                onChange={(e) => setCashModalNotes(e.target.value)}
                placeholder={
                  lang === "ar"
                    ? "مثال: تم الاستلام من البواب / تحصيل عبر بنفت باج"
                    : "e.g. Received at gate / BenefitPay transfer"
                }
              />
            </div>

            <div className="flex justify-end gap-2 pt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCashModalOrder(null)}
                disabled={isSubmittingCash}
              >
                {lang === "ar" ? "إلغاء" : "Cancel"}
              </Button>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md"
                disabled={isSubmittingCash}
                onClick={() => {
                  const amt = Number(cashCollectedInput);
                  if (isNaN(amt) || amt < 0) {
                    toast.error(
                      lang === "ar"
                        ? "يرجى إدخال مبلغ صحيح (غير سالب)"
                        : "Please enter a valid non-negative amount",
                    );
                    return;
                  }
                  handleCompleteDelivery(cashModalOrder, amt, cashModalNotes);
                }}
              >
                {isSubmittingCash ? (
                  <Loader2 className="animate-spin h-4 w-4 me-1.5 inline" />
                ) : null}
                {lang === "ar" ? "تأكيد التحصيل والتسليم" : "Confirm Cash & Complete"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
