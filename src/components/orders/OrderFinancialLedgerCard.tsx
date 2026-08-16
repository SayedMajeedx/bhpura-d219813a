import React from "react";
import { CreditCard, CheckCircle2, AlertCircle, DollarSign, Receipt, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

interface OrderFinancialLedgerCardProps {
  lang: "en" | "ar";
  currency: string;
  totals: {
    subtotal: number;
    itemDiscounts: number;
    orderDiscount: number;
    tax: number;
    total: number;
    advancePaid: number;
    balanceDue: number;
  };
  order: any;
  isReadOnly?: boolean;
  onRecordPayment?: () => void;
  onApplyDiscount?: (discountAmount: number) => void;
  children?: React.ReactNode;
}

export const OrderFinancialLedgerCard: React.FC<OrderFinancialLedgerCardProps> = ({
  lang,
  currency,
  totals,
  order,
  isReadOnly = false,
  onRecordPayment,
  onApplyDiscount,
  children,
}) => {
  const isAr = lang === "ar";
  const isFullyPaid = totals.balanceDue <= 0.001;

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-3.5 sm:p-5 shadow-2xs space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
            <CreditCard className="h-4 w-4" />
          </div>
          <h2 className="text-sm font-extrabold tracking-tight text-foreground font-display">
            {isAr ? "الملخص المالي والمدفوعات" : "Financial Summary & Payments"}
          </h2>
        </div>

        {!isReadOnly && !isFullyPaid && onRecordPayment && (
          <Button
            type="button"
            size="sm"
            onClick={onRecordPayment}
            className="h-8 px-3 text-xs font-bold gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{isAr ? "تسجيل دفعة" : "Record Payment"}</span>
          </Button>
        )}
      </div>

      {/* Financial Breakdown Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left Sub-panel: Calculation Lines */}
        <div className="space-y-2 text-xs border border-border/50 rounded-xl p-3 bg-muted/20">
          <div className="flex justify-between items-center text-muted-foreground">
            <span>{isAr ? "المجموع الفرعي" : "Subtotal"}</span>
            <span className="font-mono font-bold text-foreground">
              {formatMoney(totals.subtotal, currency, lang)}
            </span>
          </div>

          {(totals.itemDiscounts > 0 || totals.orderDiscount > 0) && (
            <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400 font-semibold">
              <span>{isAr ? "خصم المنتجات / العرض" : "Total Discount"}</span>
              <span className="font-mono font-bold">
                -{formatMoney(totals.itemDiscounts + totals.orderDiscount, currency, lang)}
              </span>
            </div>
          )}

          {totals.tax > 0 && (
            <div className="flex justify-between items-center text-muted-foreground">
              <span>{isAr ? "ضريبة القيمة المضافة (VAT)" : "Tax / VAT"}</span>
              <span className="font-mono font-bold text-foreground">
                {formatMoney(totals.tax, currency, lang)}
              </span>
            </div>
          )}

          <div className="border-t border-border/60 pt-2 flex justify-between items-center text-sm font-extrabold text-foreground font-display">
            <span>{isAr ? "المبلغ الإجمالي" : "Grand Total"}</span>
            <span className="font-mono text-base tracking-tight">
              {formatMoney(totals.total, currency, lang)}
            </span>
          </div>
        </div>

        {/* Right Sub-panel: Payment Status & Balance Ledger */}
        <div className="space-y-2 text-xs border border-border/50 rounded-xl p-3 bg-muted/20 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex justify-between items-center text-muted-foreground">
              <span>{isAr ? "المبلغ المدفوع (العربون)" : "Advance Paid"}</span>
              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                {formatMoney(totals.advancePaid, currency, lang)}
              </span>
            </div>

            <div className="flex justify-between items-center text-muted-foreground">
              <span>{isAr ? "المبلغ المتبقي" : "Outstanding Balance"}</span>
              <span
                className={cn(
                  "font-mono font-extrabold text-sm",
                  isFullyPaid
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-amber-600 dark:text-amber-400",
                )}
              >
                {formatMoney(totals.balanceDue, currency, lang)}
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-border/60">
            {isFullyPaid ? (
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{isAr ? "الطلب مدفوع بالكامل ✅" : "Fully Paid & Settled ✅"}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>
                  {isAr
                    ? `متبقي تحصيل: ${formatMoney(totals.balanceDue, currency, lang)}`
                    : `Balance Due: ${formatMoney(totals.balanceDue, currency, lang)}`}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {children}
    </div>
  );
};
