import { getPaymentGatewayReference } from "@/lib/payment-reference";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Pencil, Loader2, X, Tag, Package, CreditCard } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/format";
import { useT, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { PAYMENT_BADGE_CLASSES, type PaymentBadge } from "@/lib/payment-status";
import { calculateOrderPackagingCogs } from "@/lib/bom-calculator";
import type { Order } from "@/features/orders/types";
import { orderTotals } from "@/features/orders/lib/order-editor";
import { useBenefitReview } from "@/features/orders/hooks/use-benefit-review";
import type { Dispatch, SetStateAction } from "react";
import type { OrderItem } from "@/features/orders/types";
import type { OrderDetailData } from "@/features/orders/hooks/use-order-detail-data";

import { SummaryRow } from "@/features/orders/components/SummaryRow";
import { tPayment } from "@/features/orders/lib/payment-labels";
import { BenefitReceiptReview } from "@/features/orders/components/BenefitReceiptReview";
import { grossProfitLabel } from "@/lib/order-profit-label";
/** Totals, fees, discount and promo code, tax, payment and BenefitPay receipt review. */
export function OrderFinancialCard({
  appliedPromo,
  applyAdminPromo,
  approveBenefitPayment,
  approvingBenefit,
  bomItemsQ,
  checkingPromo,
  currency,
  discountMode,
  discountPercentInput,
  isEditingFees,
  isReadOnly,
  items,
  lang,
  lastNonZeroTaxRate,
  mobileTab,
  order,
  packagingMaterialsQ,
  paymentBadge,
  productsQ,
  promoInput,
  receiptViewQ,
  rejectBenefitPayment,
  rejectReason,
  rejectReasonOpen,
  rejectingBenefit,
  removeAdminPromo,
  setDiscountMode,
  setDiscountPercentInput,
  setIsEditingFees,
  setLastNonZeroTaxRate,
  setManagePaymentOpen,
  setOrder,
  setPromoInput,
  setRejectReason,
  setRejectReasonOpen,
  t,
  totals,
  variantsQ,
}: {
  appliedPromo: { code: string; id: string; amount: number } | null;
  applyAdminPromo: () => Promise<unknown>;
  approveBenefitPayment: ReturnType<typeof useBenefitReview>["approveBenefitPayment"];
  approvingBenefit: ReturnType<typeof useBenefitReview>["approvingBenefit"];
  bomItemsQ: OrderDetailData["bomItemsQ"];
  checkingPromo: boolean;
  currency: string;
  discountMode: "fixed" | "percent";
  discountPercentInput: string;
  isEditingFees: boolean;
  isReadOnly: boolean;
  items: OrderItem[];
  lang: ReturnType<typeof useI18n>["lang"];
  lastNonZeroTaxRate: number;
  mobileTab: "items" | "customer" | "activity";
  order: Order;
  packagingMaterialsQ: OrderDetailData["packagingMaterialsQ"];
  paymentBadge: PaymentBadge;
  productsQ: OrderDetailData["productsQ"];
  promoInput: string;
  receiptViewQ: OrderDetailData["receiptViewQ"];
  rejectBenefitPayment: ReturnType<typeof useBenefitReview>["rejectBenefitPayment"];
  rejectReason: ReturnType<typeof useBenefitReview>["rejectReason"];
  rejectReasonOpen: ReturnType<typeof useBenefitReview>["rejectReasonOpen"];
  rejectingBenefit: ReturnType<typeof useBenefitReview>["rejectingBenefit"];
  removeAdminPromo: () => void;
  setDiscountMode: Dispatch<SetStateAction<"fixed" | "percent">>;
  setDiscountPercentInput: Dispatch<SetStateAction<string>>;
  setIsEditingFees: Dispatch<SetStateAction<boolean>>;
  setLastNonZeroTaxRate: Dispatch<SetStateAction<number>>;
  setManagePaymentOpen: Dispatch<SetStateAction<boolean>>;
  setOrder: Dispatch<SetStateAction<Order | null>>;
  setPromoInput: Dispatch<SetStateAction<string>>;
  setRejectReason: ReturnType<typeof useBenefitReview>["setRejectReason"];
  setRejectReasonOpen: ReturnType<typeof useBenefitReview>["setRejectReasonOpen"];
  t: ReturnType<typeof useT>;
  totals: ReturnType<typeof orderTotals>;
  variantsQ: OrderDetailData["variantsQ"];
}) {
  return (
    <Card
      className={cn(
        "overflow-hidden border border-border-subtle shadow-xs rounded-2xl bg-card p-4 space-y-4",
        mobileTab !== "items" && "hidden sm:block",
      )}
    >
      {order.payment_method === "benefit" && order.benefit_receipt_key && (
        <BenefitReceiptReview
          approveBenefitPayment={approveBenefitPayment}
          approvingBenefit={approvingBenefit}
          lang={lang}
          order={order}
          receiptViewQ={receiptViewQ}
          rejectBenefitPayment={rejectBenefitPayment}
          rejectReason={rejectReason}
          rejectReasonOpen={rejectReasonOpen}
          rejectingBenefit={rejectingBenefit}
          setRejectReason={setRejectReason}
          setRejectReasonOpen={setRejectReasonOpen}
        />
      )}
      {/* Consolidated Financial Card Header with Toggle Button */}
      <div className="flex items-center justify-between border-b border-border-subtle pb-2.5">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold text-foreground">
            {lang === "ar" ? "الملخص المالي والرسوم" : "Financial Summary & Ledger"}
          </span>
        </div>
        {!isReadOnly && (
          <Button
            type="button"
            variant={isEditingFees ? "secondary" : "outline"}
            size="sm"
            onClick={() => setIsEditingFees(!isEditingFees)}
            className="h-7 px-2.5 text-xs font-bold rounded-xl gap-1.5 border-border-strong"
          >
            <Pencil className="h-3 w-3" />
            <span>
              {isEditingFees
                ? lang === "ar"
                  ? "إغلاق التعديل"
                  : "Done Editing"
                : lang === "ar"
                  ? "تعديل الرسوم والخصم"
                  : "Edit Fees & Discounts"}
            </span>
          </Button>
        )}
      </div>

      {/* Integrated Order & Payment Channel Summary Strip */}
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/40 p-2.5 text-xs">
        <div>
          <span className="text-xs text-muted-foreground block font-medium">
            {t("orderDetail.orderDate")}
          </span>
          <span className="font-bold text-foreground">
            {formatDate(order.order_date, lang === "ar" ? "ar-BH" : "en-BH")}
          </span>
        </div>
        <div>
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs text-muted-foreground block font-medium">
              {t("orderDetail.paymentMethod")}
            </span>
            <button
              type="button"
              onClick={() => setManagePaymentOpen(true)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline focus-visible:outline-none cursor-pointer"
              title={lang === "ar" ? "تعديل طريقة الدفع" : "Edit payment method"}
            >
              <Pencil className="h-2.5 w-2.5 shrink-0" />
              <span>{lang === "ar" ? "تغيير" : "Edit"}</span>
            </button>
          </div>
          <span className="font-bold text-foreground block mt-0.5">
            {tPayment(order.payment_method, lang) || (lang === "ar" ? "غير محدد" : "Not specified")}
          </span>
        </div>
        {getPaymentGatewayReference(order) && (
          <div className="col-span-2 border-t border-border-subtle pt-1.5 flex items-center justify-between font-mono text-xs">
            <span className="text-muted-foreground">Gateway Ref:</span>
            <span className="font-bold text-foreground truncate max-w-[200px]">
              {getPaymentGatewayReference(order)}
            </span>
          </div>
        )}
      </div>

      {/* Collapsible Fee & Discount Edit Inputs */}
      {isEditingFees && (
        <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-3 animate-fade-in">
          <div className="rounded-lg border bg-background p-2.5 space-y-2">
            <Label className="text-xs font-bold">
              {lang === "ar" ? "تطبيق رمز خصم" : "Apply Promo Code"}
            </Label>
            {appliedPromo ? (
              <div className="flex items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-emerald-900 text-xs font-medium">
                <div className="flex min-w-0 items-center gap-2">
                  <Tag className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate font-mono font-bold">{appliedPromo.code}</span>
                  <span>− {formatMoney(appliedPromo.amount, currency)}</span>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 shrink-0"
                  onClick={removeAdminPromo}
                  disabled={isReadOnly}
                  aria-label={lang === "ar" ? "إزالة الخصم" : "Remove discount"}
                  title={lang === "ar" ? "إزالة الخصم" : "Remove discount"}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  value={promoInput}
                  onChange={(event) => setPromoInput(event.target.value.toUpperCase())}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void applyAdminPromo();
                    }
                  }}
                  placeholder="EID20"
                  className="uppercase h-8 text-xs font-mono"
                  disabled={isReadOnly || checkingPromo}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={applyAdminPromo}
                  disabled={isReadOnly || checkingPromo}
                  className="h-8 text-xs font-bold"
                >
                  {checkingPromo && <Loader2 className="me-1 h-3.5 w-3.5 animate-spin" />}
                  {lang === "ar" ? "تطبيق" : "Apply"}
                </Button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <div className="flex items-center justify-between mb-1 text-xs">
                <Label className="text-xs font-bold">{t("orderDetail.discount")}</Label>
                {!appliedPromo && !isReadOnly && (
                  <div className="flex items-center rounded-md border p-0.5 text-xs bg-background">
                    <button
                      type="button"
                      className={cn(
                        "px-1.5 py-0.5 rounded font-bold transition-colors",
                        discountMode === "fixed"
                          ? "bg-primary text-primary-foreground shadow-2xs"
                          : "text-muted-foreground",
                      )}
                      onClick={() => setDiscountMode("fixed")}
                    >
                      {currency}
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "px-1.5 py-0.5 rounded font-bold transition-colors",
                        discountMode === "percent"
                          ? "bg-primary text-primary-foreground shadow-2xs"
                          : "text-muted-foreground",
                      )}
                      onClick={() => {
                        setDiscountMode("percent");
                        if (totals.subtotal > 0 && order.discount > 0) {
                          const pct = (order.discount / totals.subtotal) * 100;
                          setDiscountPercentInput(pct.toFixed(1));
                        }
                      }}
                    >
                      %
                    </button>
                  </div>
                )}
              </div>
              {discountMode === "percent" && !appliedPromo ? (
                <div className="relative">
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    placeholder="10"
                    value={discountPercentInput}
                    disabled={isReadOnly}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDiscountPercentInput(val);
                      const pct = Number(val) || 0;
                      const calculated = Number(((totals.subtotal * pct) / 100).toFixed(3));
                      setOrder({ ...order, discount: calculated });
                    }}
                    className="h-8 text-xs font-mono"
                  />
                  <span className="absolute end-2.5 top-2 text-xs text-muted-foreground font-bold">
                    %
                  </span>
                </div>
              ) : (
                <Input
                  type="number"
                  step="0.001"
                  value={order.discount}
                  disabled={isReadOnly || !!appliedPromo}
                  onChange={(e) => setOrder({ ...order, discount: Number(e.target.value) })}
                  className="h-8 text-xs font-mono"
                />
              )}
            </div>

            <div>
              <Label className="text-xs font-bold mb-1 block">{t("orderDetail.shipping")}</Label>
              <Input
                type="number"
                step="0.01"
                value={order.shipping}
                onChange={(e) => setOrder({ ...order, shipping: Number(e.target.value) })}
                className="h-8 text-xs font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <div className="flex items-center justify-between mb-1 text-xs">
                <Label className="text-xs font-bold">{t("orderDetail.taxRate")}</Label>
                {!isReadOnly && (
                  <button
                    type="button"
                    className="text-xs text-primary font-bold hover:underline"
                    onClick={() => {
                      if (Number(order.tax_rate) > 0) {
                        setLastNonZeroTaxRate(Number(order.tax_rate));
                        setOrder({ ...order, tax_rate: 0 });
                      } else {
                        setOrder({ ...order, tax_rate: lastNonZeroTaxRate || 10 });
                      }
                    }}
                  >
                    {Number(order.tax_rate) === 0 ? "Exempt (0%)" : "Tax Exempt?"}
                  </button>
                )}
              </div>
              <Input
                type="number"
                step="0.01"
                value={order.tax_rate}
                onChange={(e) => setOrder({ ...order, tax_rate: Number(e.target.value) })}
                className="h-8 text-xs font-mono"
              />
            </div>

            <div>
              <Label className="text-xs font-bold mb-1 block">{t("orderDetail.advancePaid")}</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={order.advance_paid ?? 0}
                onChange={(e) => setOrder({ ...order, advance_paid: Number(e.target.value) })}
                className="h-8 text-xs font-mono font-bold text-foreground"
              />
            </div>
          </div>
        </div>
      )}
      <div className="space-y-1 border-t border-border pt-3 text-sm">
        <SummaryRow
          label={t("orderDetail.subtotal")}
          value={formatMoney(totals.subtotal, currency)}
        />
        <SummaryRow
          label={`${t("orderDetail.discount")}${order.promo_code ? ` (Promo: ${order.promo_code})` : ""}`}
          value={`− ${formatMoney(totals.discount, currency)}`}
        />
        <SummaryRow
          label={`${t("orderDetail.vat")} (${order.tax_rate}%)`}
          value={formatMoney(totals.taxAmount, currency)}
        />
        <SummaryRow
          label={t("orderDetail.shipping")}
          value={formatMoney(totals.shipping, currency)}
        />
        <div className="flex justify-between items-center pt-2 border-t border-border">
          <span className="font-display text-lg">{t("orderDetail.total")}</span>
          <div className="flex items-center gap-2">
            <span className="font-display text-lg">{formatMoney(totals.total, currency)}</span>
            <span
              className={`text-xs  px-2 py-0.5 rounded-full border ${PAYMENT_BADGE_CLASSES[paymentBadge]}`}
            >
              {t(`payStatus.${paymentBadge}`)}
            </span>
          </div>
        </div>
        {totals.advancePaid > 0 && (
          <>
            <SummaryRow
              label={t("orderDetail.advancePaid")}
              value={`− ${formatMoney(totals.advancePaid, currency)}`}
            />
            <div className="flex justify-between pt-1 font-medium">
              <span>{t("orderDetail.remaining")}</span>
              <span>{formatMoney(totals.remaining, currency)}</span>
            </div>
          </>
        )}
      </div>

      {/* Direct Order COGS Breakdown Badge */}
      {(() => {
        const isAr = lang === "ar";
        const productCogsTotal = items.reduce((sum, it: any) => {
          const qty = Number(it.quantity || 1);
          const unitCost = Number(it.unit_cost || 0);
          return sum + unitCost * qty;
        }, 0);

        // This card is an estimated order margin, so show the configured BOM
        // before fulfillment as well. Financial reports recognize actual COGS
        // according to the order lifecycle.
        const packagingCogsTotal = calculateOrderPackagingCogs(
          items,
          true,
          productsQ.data ?? [],
          variantsQ.data ?? [],
          bomItemsQ.data ?? [],
          packagingMaterialsQ.data ?? [],
        );

        const orderTotalCogs = productCogsTotal + packagingCogsTotal;
        const orderNetProfit = totals.total - orderTotalCogs;

        return (
          <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-3.5 space-y-2 text-xs">
            <div className="flex items-center justify-between font-bold text-foreground">
              <span className="flex items-center gap-1.5">
                <Package className="h-4 w-4 text-primary shrink-0" />
                <span>
                  {isAr
                    ? "تكاليف الإنتاج والتغليف المباشرة للطلب (Order COGS)"
                    : "Direct Order COGS Breakdown"}
                </span>
              </span>
              <span className="font-mono text-sm font-extrabold text-primary">
                {formatMoney(orderTotalCogs, currency)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 font-mono text-xs pt-1.5 border-t border-border-subtle text-muted-foreground">
              <div>
                <span>{isAr ? "تكلفة المنتجات:" : "Product Cost:"} </span>
                <strong className="text-foreground">
                  {formatMoney(productCogsTotal, currency)}
                </strong>
              </div>
              <div>
                <span>{isAr ? "تكلفة مواد التغليف:" : "Packaging Cost:"} </span>
                <strong className="text-foreground">
                  {formatMoney(packagingCogsTotal, currency)}
                </strong>
              </div>
            </div>

            <div
              className={cn(
                "flex justify-between items-center text-xs font-extrabold pt-1.5 border-t border-border-subtle",
                totals.remaining > 0
                  ? "text-amber-700 dark:text-amber-300"
                  : "text-emerald-600 dark:text-emerald-400",
              )}
            >
              <span>{grossProfitLabel(totals.remaining, isAr ? "ar" : "en")}</span>
              <span className="font-mono text-sm font-extrabold">
                {formatMoney(orderNetProfit, currency)}
              </span>
            </div>
          </div>
        );
      })()}
    </Card>
  );
}
