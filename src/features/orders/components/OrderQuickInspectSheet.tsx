import type React from "react";
import { Link } from "@tanstack/react-router";
import { getPaymentGatewayReference } from "@/lib/payment-reference";
import { Button } from "@/components/ui/button";
import { ExternalLink, Copy, Lock, Phone, MessageCircle } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { formatDate, formatMoney } from "@/lib/format";
import { toast } from "sonner";
import { useProfile } from "@/lib/profile-context";
import { getOrderCustomerContact, getOrderCustomerName } from "@/lib/order-customer-snapshot";
import { useOrderNumber } from "@/hooks/use-order-number";
import { expectedAdvance } from "@/features/orders/lib/expected-advance";
import { AdvanceRequirementNotice } from "@/features/orders/components/AdvanceRequirementNotice";

export function CustomerContactActions({ customer, lang }: { customer: any; lang: "en" | "ar" }) {
  if (!customer?.phone) return null;
  const rawPhone = String(customer.phone);
  const cleanPhone = rawPhone.replace(/[^0-9+]/g, "");
  const waPhone = cleanPhone.startsWith("+")
    ? cleanPhone.replace("+", "")
    : cleanPhone.length === 8
      ? `973${cleanPhone}`
      : cleanPhone;

  return (
    <div className="flex items-center gap-1.5 mt-1.5">
      <a
        href={`tel:${cleanPhone}`}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-md bg-muted text-foreground hover:bg-muted/80 transition-colors shadow-xs"
      >
        <Phone className="h-3 w-3 text-blue-600 dark:text-blue-400 shrink-0" />
        {lang === "ar" ? "اتصال" : "Call"}
      </a>
      <a
        href={`https://wa.me/${waPhone}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200/60 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 transition-colors shadow-xs"
      >
        <MessageCircle className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
        {lang === "ar" ? "واتساب" : "WhatsApp"}
      </a>
    </div>
  );
}

export function OrderQuickInspectSheet({
  order,
  slug,
  lang,
  locale,
  onClose,
  renderAction,
}: {
  order: any | null;
  slug: string;
  lang: string;
  locale: string;
  onClose: () => void;
  /**
   * The order's next step, the list row's own button (`renderOrderQueueAction`): the sheet
   * covers the row, so it once offered only "open the full page". The caller passes the list's
   * live copy of the order, so the button moves on once a step is taken; its dialogs (the
   * workshop's among them, which the button owns) open over the sheet.
   */
  renderAction?: (order: any) => React.ReactNode;
}) {
  const orderNo = useOrderNumber();
  const { isAdmin } = useProfile();
  if (!order) return null;
  const isAr = lang === "ar";
  const items = order.order_items ?? [];
  const action = renderAction?.(order) ?? null;

  return (
    <Sheet open={Boolean(order)} onOpenChange={(open: boolean) => !open && onClose()}>
      <SheetContent
        side={isAr ? "left" : "right"}
        className="w-full sm:max-w-lg p-0 flex flex-col bg-background shadow-2xl"
      >
        <div className="p-6 pe-16 ps-12 border-b space-y-2">
          <div className="flex items-center justify-between gap-3">
            <SheetTitle className="text-xl font-semibold tabular-nums">
              {orderNo(order.invoice_number)}
            </SheetTitle>
            <span className="text-xs font-mono font-bold text-muted-foreground">
              {formatDate(order.created_at ?? order.order_date, locale)}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Customer Card */}
          <div className="rounded-xl border p-4 space-y-2 bg-card">
            <h4 className="text-xs font-semibold text-muted-foreground">
              {isAr ? "العميل" : "Customer"}
            </h4>
            <div className="text-sm font-semibold">
              {getOrderCustomerName(order) || (isAr ? "عميل غير مسجل" : "Guest")}
            </div>
            <CustomerContactActions
              customer={getOrderCustomerContact(order)}
              lang={lang as "en" | "ar"}
            />
          </div>

          {/* Line Items Breakdown */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground">
              {isAr ? "المنتجات" : "Items"}
            </h4>
            <div className="divide-y border border-border-subtle rounded-xl overflow-hidden bg-card shadow-2xs">
              {items.map((it: any, idx: number) => {
                const itemTitle =
                  it.description ||
                  it.product_name ||
                  it.product_title ||
                  it.item_title ||
                  it.title ||
                  it.name ||
                  (isAr ? it.product_name_ar || it.name_ar : it.product_name_en || it.name_en) ||
                  it.products?.name ||
                  it.products?.name_ar ||
                  it.products?.name_en ||
                  (isAr ? "منتج" : "Product");

                const variantTitle =
                  it.variant_title ||
                  it.variant_name ||
                  [it.size, it.color].filter(Boolean).join(" / ") ||
                  (it.customizations && typeof it.customizations === "object"
                    ? Object.entries(it.customizations)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(" | ")
                    : typeof it.customizations === "string"
                      ? it.customizations
                      : "") ||
                  "";

                const qty = it.quantity || it.qty || 1;
                const unitPrice = Number(it.unit_price || it.price || 0);
                const lineTotal = Number(
                  it.line_total || it.total_price || it.total || qty * unitPrice,
                );

                return (
                  <div
                    key={it.id || idx}
                    className="p-3.5 flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm text-foreground leading-snug">
                        <span className="text-muted-foreground font-medium tabular-nums me-1.5">
                          {qty}×
                        </span>
                        {itemTitle}
                      </div>
                      {variantTitle && (
                        <div className="text-xs text-muted-foreground mt-0.5">{variantTitle}</div>
                      )}
                      <div className="text-xs text-muted-foreground font-mono mt-1">
                        {qty} × {formatMoney(unitPrice, order.currency || "BHD", locale)}
                      </div>
                    </div>
                    <div className="font-semibold tabular-nums shrink-0 text-sm text-foreground pt-0.5">
                      {formatMoney(lineTotal, order.currency || "BHD", locale)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Detailed Financial Price Breakdown */}
          {(() => {
            const currency = order.currency || "BHD";

            // Calculate items subtotal
            const itemsSum = items.reduce((acc: number, it: any) => {
              const qty = it.quantity || it.qty || 1;
              const unitPrice = Number(it.unit_price || it.price || 0);
              const lineTotal = Number(it.line_total || it.total_price || qty * unitPrice);
              return acc + lineTotal;
            }, 0);

            const subtotal = Number(
              order.subtotal ?? (itemsSum > 0 ? itemsSum : (order.total ?? 0)),
            );
            const discount = Number(order.discount ?? order.discount_amount ?? 0);
            let shipping = Number(
              order.shipping ??
                order.shipping_amount ??
                order.delivery_fee ??
                order.shipping_fee ??
                0,
            );
            const tax = Number(order.tax_amount ?? order.vat ?? order.tax ?? 0);
            const advancePaid = Number(order.advance_paid ?? order.paid_amount ?? 0);
            const netTotal = Number(
              order.total ?? order.total_amount ?? subtotal + shipping + tax - discount,
            );

            // Auto-infer shipping or delivery fee if netTotal > (subtotal + tax - discount)
            const calculatedDiff = netTotal - (subtotal + tax - discount);
            if (shipping === 0 && calculatedDiff > 0) {
              shipping = calculatedDiff;
            }

            const codRemaining = Math.max(0, netTotal - advancePaid);
            const expected = expectedAdvance(order);

            return (
              <div className="space-y-3">
                {expected && (
                  <AdvanceRequirementNotice
                    expected={expected}
                    currency={currency}
                    lang={isAr ? "ar" : "en"}
                    appointment={order.fulfillment_method === "appointment"}
                  />
                )}
                <div className="rounded-xl border border-border-subtle p-4 space-y-2.5 bg-card/80 text-xs shadow-2xs">
                  <h4 className="text-xs font-semibold text-muted-foreground border-b border-border-subtle pb-2">
                    {isAr ? "الحساب" : "Summary"}
                  </h4>

                  <div className="space-y-2 tabular-nums text-muted-foreground">
                    <div className="flex justify-between items-center">
                      <span>{isAr ? "المجموع" : "Subtotal"}</span>
                      <span className="font-semibold text-foreground">
                        {formatMoney(subtotal, currency, locale)}
                      </span>
                    </div>

                    {discount > 0 && (
                      <div className="flex justify-between items-center">
                        <span>{isAr ? "الخصم" : "Discount"}</span>
                        <span className="font-semibold text-foreground">
                          -{formatMoney(discount, currency, locale)}
                        </span>
                      </div>
                    )}

                    {shipping > 0 && (
                      <div className="flex justify-between items-center">
                        <span>{isAr ? "التوصيل" : "Delivery"}</span>
                        <span className="font-semibold text-foreground">
                          +{formatMoney(shipping, currency, locale)}
                        </span>
                      </div>
                    )}

                    {tax > 0 && (
                      <div className="flex justify-between items-center">
                        <span>{isAr ? "ضريبة القيمة المضافة" : "VAT"}</span>
                        <span className="font-semibold text-foreground">
                          +{formatMoney(tax, currency, locale)}
                        </span>
                      </div>
                    )}

                    {advancePaid > 0 && (
                      <div className="flex justify-between items-center pt-1 border-t border-border-subtle">
                        <span>{isAr ? "المدفوع مقدماً" : "Paid in advance"}</span>
                        <span className="font-semibold text-foreground">
                          -{formatMoney(advancePaid, currency, locale)}
                        </span>
                      </div>
                    )}

                    {advancePaid > 0 && codRemaining > 0 && (
                      <div className="flex justify-between items-center font-semibold text-foreground bg-warning-subtle p-1.5 rounded-lg border border-warning/30">
                        <span>{isAr ? "المتبقي عند التسليم" : "Due on delivery"}</span>
                        <span>{formatMoney(codRemaining, currency, locale)}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between items-center text-sm font-bold pt-2.5 border-t border-border-subtle text-foreground">
                    <span>{isAr ? "الإجمالي" : "Total"}</span>
                    <span className="text-base text-foreground tabular-nums font-bold">
                      {formatMoney(netTotal, currency, locale)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        {isAdmin && getPaymentGatewayReference(order) ? (
          <div className="mx-6 mb-6 rounded-xl border border-border-subtle bg-card p-4 space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-primary" />
                <span className="font-semibold text-sm">
                  {isAr ? "بوابة الدفع" : "Payment gateway"}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-xs font-mono">
              <div>
                <span className="text-muted-foreground block mb-1">
                  {isAr ? "المرجع" : "Reference"}
                </span>
                <div className="flex items-center gap-2">
                  <span className="truncate">{getPaymentGatewayReference(order)}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => {
                      navigator.clipboard.writeText(getPaymentGatewayReference(order)!);
                      toast.success(isAr ? "تم النسخ" : "Copied");
                    }}
                    aria-label={isAr ? "نسخ" : "Copy"}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div>
                <span className="text-muted-foreground block mb-1">
                  {isAr ? "الحالة" : "Status"}
                </span>
                <span>{order.gateway_status || "—"}</span>
              </div>
              {order.gateway_verified_at && (
                <div className="col-span-2">
                  <span className="text-muted-foreground block mb-1">
                    {isAr ? "آخر تحقق" : "Last verified"}
                  </span>
                  <span>{new Date(order.gateway_verified_at).toLocaleString(locale)}</span>
                </div>
              )}
            </div>
          </div>
        ) : null}

        <div className="p-4 border-t bg-muted/20 flex flex-wrap items-center gap-2">
          {action && (
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{action}</div>
          )}
          <Button
            asChild
            variant={action ? "outline" : "default"}
            className={`h-11 rounded-xl font-bold ${action ? "" : "flex-1"}`}
          >
            <Link to="/admin/b/$slug/orders/$id" params={{ slug, id: order.id }}>
              <ExternalLink className="h-4 w-4 me-2" />
              {isAr ? "صفحة الطلب" : "Order page"}
            </Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
