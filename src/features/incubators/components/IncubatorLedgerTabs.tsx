import { Link } from "@tanstack/react-router";
import { RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ListPagination } from "@/components/list-pagination";
import type { IncubatorsPageState } from "@/features/incubators/hooks/use-incubators-page";
import { movementLines } from "@/features/incubators/lib/movements";
import { pieceName } from "@/features/incubators/lib/partner-stock";
import {
  saleCanBeReversed,
  saleProfit,
  saleState,
  saleStateLabel,
} from "@/features/incubators/lib/summary";

/** A label over its value, in a grid that wraps on a phone. */
function Fact({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`break-words text-sm ${strong ? "font-bold" : "font-medium"}`}>{value}</dd>
    </div>
  );
}

const day = (value: string, locale: string) => new Date(value).toLocaleDateString(locale);

/**
 * The partner's sales, each with everything that was agreed: the piece, how many, at what
 * price, the partner's commission, the store's share and what is still owed on it. Staff who
 * may see costs also read what the store kept after the piece's cost and packaging.
 */
export function IncubatorSalesTab({ page }: { page: IncubatorsPageState }) {
  const {
    busy,
    canViewFinancials,
    isAr,
    lang,
    locale,
    money,
    pagedSales,
    sales,
    salesPaging,
    setSaleToReverse,
    setSalesPaging,
  } = page;
  return (
    <div className="space-y-3">
      <Card className="divide-y divide-border border-border">
        {pagedSales.map((sale) => {
          const state = saleState(sale);
          const profit = canViewFinancials ? saleProfit(sale) : null;
          const owed = Math.max(0, Number(sale.net_due) - Number(sale.paid_amount || 0));
          return (
            <div key={sale.id} className={`p-4 ${state === "reversed" ? "opacity-60" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words text-sm font-bold" dir="auto">
                    {sale.quantity} × {pieceName(sale.product_variants, lang)}
                  </p>
                  <p className="text-xs text-muted-foreground">{day(sale.sold_at, locale)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={state === "due" ? "default" : "secondary"}>
                    {saleStateLabel(state, lang)}
                  </Badge>
                  {saleCanBeReversed(sale) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
                      onClick={() => setSaleToReverse(sale)}
                    >
                      <RotateCcw className="me-1 h-3.5 w-3.5" />
                      {isAr ? "إلغاء البيع" : "Reverse"}
                    </Button>
                  )}
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <Fact
                  label={isAr ? "سعر القطعة" : "Unit price"}
                  value={money(Number(sale.unit_price))}
                />
                <Fact
                  label={isAr ? "إجمالي البيع" : "Sale total"}
                  value={money(Number(sale.gross_amount))}
                />
                <Fact
                  label={isAr ? "عمولة المحل الشريك" : "Commission"}
                  value={money(Number(sale.commission_amount))}
                />
                <Fact
                  label={isAr ? "المستحق لنا" : "Due to us"}
                  value={money(Number(sale.net_due))}
                  strong
                />
                <Fact
                  label={isAr ? "المتبقي" : "Still owed"}
                  value={state === "reversed" ? "—" : money(owed)}
                />
                {profit !== null && (
                  <Fact label={isAr ? "صافي الربح" : "Profit after costs"} value={money(profit)} />
                )}
              </dl>
              {state === "reversed" && sale.reversal_reason && (
                <p className="mt-2 break-words text-xs text-muted-foreground" dir="auto">
                  {sale.reversal_reason}
                </p>
              )}
            </div>
          );
        })}
        {sales.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {isAr ? "لا توجد مبيعات مسجلة" : "No recorded sales"}
          </p>
        )}
      </Card>
      <ListPagination
        lang={lang}
        noun="sale"
        totalItems={sales.length}
        page={salesPaging.page}
        pageSize={salesPaging.size}
        onPageChange={(next) => setSalesPaging({ ...salesPaging, page: next })}
        onPageSizeChange={(size) => setSalesPaging({ page: 1, size })}
      />
    </div>
  );
}

/** The payments received, each with the sales it settled. */
export function IncubatorPaymentsTab({ page }: { page: IncubatorsPageState }) {
  const {
    busy,
    isAr,
    lang,
    locale,
    money,
    pagedPayments,
    payments,
    paymentsPaging,
    setPaymentToVoid,
    setPaymentsPaging,
    settlements,
  } = page;
  return (
    <div className="space-y-3">
      <Card className="divide-y divide-border border-border">
        {pagedPayments.map((payment) => {
          const settled = settlements.get(payment.id) ?? [];
          const voided = Boolean(payment.voided_at);
          return (
            <div key={payment.id} className={`p-4 ${voided ? "opacity-60" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words text-sm font-bold" dir="auto">
                    {payment.reference || payment.payment_method || (isAr ? "دفعة" : "Payment")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {day(payment.payment_date, locale)}
                    {payment.reference && payment.payment_method
                      ? ` · ${payment.payment_method}`
                      : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-start gap-2">
                  <div className="text-end">
                    <p className={`font-bold ${voided ? "line-through" : ""}`}>
                      {money(Number(payment.amount))}
                    </p>
                    <Badge variant="secondary" className="mt-1">
                      {voided ? (isAr ? "ملغاة" : "Voided") : isAr ? "مستلمة" : "Received"}
                    </Badge>
                  </div>
                  {!voided && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
                      onClick={() => setPaymentToVoid(payment)}
                    >
                      <RotateCcw className="me-1 h-3.5 w-3.5" />
                      {isAr ? "إلغاء الدفعة" : "Void"}
                    </Button>
                  )}
                </div>
              </div>
              {voided && payment.void_reason && (
                <p className="mt-2 break-words text-xs text-muted-foreground" dir="auto">
                  {isAr ? "سبب الإلغاء" : "Voided"}: {payment.void_reason}
                </p>
              )}
              {settled.length > 0 && (
                <div className="mt-3 rounded-lg bg-muted/40 p-2.5">
                  <p className="text-xs font-semibold text-muted-foreground">
                    {isAr ? "سدّدت هذه المبيعات" : "It settled these sales"}
                  </p>
                  <ul className="mt-1 space-y-1 text-xs">
                    {settled.map((part) => (
                      <li key={part.saleId} className="flex justify-between gap-3">
                        <span className="min-w-0 break-words" dir="auto">
                          {part.sale
                            ? `${part.sale.quantity} × ${pieceName(part.sale.product_variants, lang)} · ${day(part.sale.sold_at, locale)}`
                            : isAr
                              ? "بيعة"
                              : "A sale"}
                        </span>
                        <span className="shrink-0 font-semibold">{money(part.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {payment.notes && (
                <p className="mt-2 break-words text-xs text-muted-foreground" dir="auto">
                  {payment.notes}
                </p>
              )}
            </div>
          );
        })}
        {payments.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {isAr ? "لا توجد دفعات مسجلة" : "No recorded payments"}
          </p>
        )}
      </Card>
      <ListPagination
        lang={lang}
        noun="payment"
        totalItems={payments.length}
        page={paymentsPaging.page}
        pageSize={paymentsPaging.size}
        onPageChange={(next) => setPaymentsPaging({ ...paymentsPaging, page: next })}
        onPageSizeChange={(size) => setPaymentsPaging({ page: 1, size })}
      />
    </div>
  );
}

/**
 * The partner's history: every time pieces went to it, came back, were sold there, or were
 * taken (or given back) by one of the store's own orders. Read a page at a time.
 */
export function IncubatorHistoryTab({ page }: { page: IncubatorsPageState }) {
  const {
    brand,
    isAr,
    lang,
    locale,
    movements,
    movementsLoading,
    movementsPaging,
    movementsTotal,
    setMovementsPaging,
  } = page;
  const lines = movementLines(movements, lang);
  return (
    <div className="space-y-3">
      <Card className="divide-y divide-border border-border">
        {lines.map((line) => (
          <div key={line.id} className="flex items-start justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="text-sm font-bold">{line.label}</p>
              <p className="break-words text-xs text-muted-foreground" dir="auto">
                {line.piece}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {new Date(line.at).toLocaleString(locale, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
                {line.orderId && (
                  <>
                    {" · "}
                    <Link
                      to="/admin/b/$slug/orders/$id"
                      params={{ slug: brand.slug, id: line.orderId }}
                      className="font-semibold underline underline-offset-2"
                    >
                      {isAr ? "فتح الطلب" : "Open the order"}
                    </Link>
                  </>
                )}
              </p>
              {line.note && (
                <p className="mt-1 break-words text-xs" dir="auto">
                  {line.note}
                </p>
              )}
            </div>
            <span
              dir="ltr"
              className={`shrink-0 rounded-full px-2.5 py-1 text-sm font-black ${line.delta > 0 ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-muted text-foreground"}`}
            >
              {line.deltaText}
            </span>
          </div>
        ))}
        {lines.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {movementsLoading
              ? isAr
                ? "جاري تحميل السجل..."
                : "Loading the history..."
              : isAr
                ? "لا توجد حركات مسجلة"
                : "No movements recorded"}
          </p>
        )}
      </Card>
      <ListPagination
        lang={lang}
        noun="movement"
        totalItems={movementsTotal}
        page={movementsPaging.page}
        pageSize={movementsPaging.size}
        onPageChange={(next) => setMovementsPaging({ ...movementsPaging, page: next })}
        onPageSizeChange={(size) => setMovementsPaging({ page: 1, size })}
      />
    </div>
  );
}
