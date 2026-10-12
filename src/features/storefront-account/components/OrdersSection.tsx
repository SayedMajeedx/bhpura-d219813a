import { useState } from "react";
import { useStorefront, formatPrice } from "@/lib/storefront-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OsEmptyState } from "@/components/os/os-empty-state";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Loader2,
  PackageSearch,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  FileText,
  RotateCcw,
} from "lucide-react";
import { statusMeta } from "@/features/storefront-account/lib/account-shared";
import type { OrderRow } from "@/features/storefront-account/lib/account-shared";
import { OrderTimelineTracker } from "@/features/storefront-account/components/OrderTimelineTracker";

export function OrdersSection({
  currency,
  isAr,
  lang,
  orders,
  isLoading,
  onRequestReturn,
}: {
  currency: string;
  isAr: boolean;
  lang: "ar" | "en";
  orders?: OrderRow[];
  isLoading: boolean;
  onRequestReturn?: (order: OrderRow) => void;
}) {
  const { t, settings } = useStorefront();
  const [expandedOrder, setExpandedOrder] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedOrder((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const contactSupport = (order: OrderRow) => {
    if (!settings.whatsapp_number) return;
    const digits = settings.whatsapp_number.replace(/\D/g, "");
    const totalText = formatPrice(Number(order.total), order.currency || currency, lang);
    const dateText = new Date(order.order_date).toLocaleDateString(
      isAr ? "ar-BH-u-nu-latn" : "en-BH",
    );

    const text = isAr
      ? `مرحباً! لدي استفسار بخصوص الطلب رقم #${order.invoice_number} (القيمة إجمالاً: ${totalText}، تاريخ الطلب: ${dateText}). هل يمكنكم مساعدتي؟`
      : `Hello! I have an inquiry regarding my Order #${order.invoice_number} (Total value: ${totalText}, Date: ${dateText}). Could you please assist me?`;
    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`, "_blank");
  };

  const copyInvoiceLink = async (order: OrderRow) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const token = order.public_invoice_token || order.id;
    const url = `${origin}/invoice/${token}`;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      toast.success(t("تم نسخ رابط الفاتورة", "Invoice link copied to clipboard"));
    } catch {
      toast.error(t("عذراً، فشل نسخ الرابط", "Failed to copy invoice link"));
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!orders || orders.length === 0) {
    return (
      <OsEmptyState
        icon={PackageSearch}
        title={t("لا توجد أي طلبات نشطة", "No orders placed yet")}
        description={t(
          "لم تسجل أي مشتريات من هذا المتجر بعد. بمجرد إتمامك للشراء ستظهر طلباتك هنا.",
          "All purchases you make on this store will appear detailed in this panel.",
        )}
      />
    );
  }

  return (
    <div className="space-y-4">
      {orders.map((o) => {
        const st = statusMeta(o.status, o.payment_status, o.fulfillment_status, isAr);
        const isExpanded = !!expandedOrder[o.id];
        const date = new Date(o.order_date).toLocaleDateString(isAr ? "ar-BH-u-nu-latn" : "en-BH", {
          year: "numeric",
          month: "short",
          day: "numeric",
        });

        return (
          <Card
            key={o.id}
            className="p-5 border border-border-strong hover:border-primary/20 shadow-xs hover:shadow-md transition-all duration-300 rounded-xl bg-card"
          >
            {/* Header info bar */}
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-base" style={{ color: "var(--sf-heading)" }}>
                    {t("طلب رقم", "Order")} #{o.invoice_number}
                  </span>
                  <Badge
                    className={`${st.tone} text-xs font-bold border-0 px-2.5 py-0.5 rounded-full`}
                  >
                    {st.label}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">{date}</div>
              </div>
              <div className="text-end">
                <p className="text-xs uppercase font-bold tracking-widest text-muted-foreground">
                  {t("الإجمالي", "Total Value")}
                </p>
                <p className="text-lg font-bold mt-0.5" style={{ color: "var(--sf-heading)" }}>
                  {formatPrice(Number(o.total), o.currency || currency, lang)}
                </p>
              </div>
            </div>

            {/* Stepper tracking progress timeline */}
            <OrderTimelineTracker
              status={o.status}
              paymentStatus={o.payment_status}
              fulfillmentStatus={o.fulfillment_status}
              isAr={isAr}
              t={t}
            />

            {/* Expander list control */}
            <div className="mt-5 pt-3 border-t border-border-subtle">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => toggleExpand(o.id)}
                className="w-full text-xs flex items-center justify-between text-muted-foreground hover:text-foreground font-semibold px-2"
              >
                <span>{t("عرض تفاصيل المنتجات والمشتريات", "View ordered items detail")}</span>
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>

              {isExpanded && o.order_items && o.order_items.length > 0 && (
                <div className="mt-3 bg-muted/30 rounded-lg p-3.5 space-y-2 border border-border-subtle">
                  <ul className="space-y-2 text-xs">
                    {o.order_items.map((it) => (
                      <li
                        key={it.id}
                        className="flex justify-between items-center gap-3 border-b border-dashed border-border-subtle pb-2 last:border-0 last:pb-0"
                      >
                        <span className="font-medium text-foreground">
                          {it.description}{" "}
                          <span className="text-primary text-xs bg-primary/10 px-1.5 py-0.5 rounded ms-1">
                            × {it.quantity}
                          </span>
                        </span>
                        <span className="font-semibold text-muted-foreground shrink-0">
                          {formatPrice(
                            Number(it.unit_price) * it.quantity,
                            o.currency || currency,
                            lang,
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Actions Bar Footer */}
            <div className="mt-4 pt-4 border-t border-border-subtle flex flex-wrap gap-2 items-center justify-between">
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-8 px-3 font-semibold gap-1"
                  onClick={() => copyInvoiceLink(o)}
                >
                  <FileText className="h-3.5 w-3.5" />
                  {t("رابط الفاتورة", "Invoice Link")}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-8 px-3 font-semibold gap-1 text-primary hover:bg-primary/10 border-primary/30"
                  onClick={() => onRequestReturn?.(o)}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {t("طلب إرجاع / استبدال", "Return / Exchange")}
                </Button>
              </div>

              {settings.whatsapp_enabled && settings.whatsapp_number && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-8 px-3 font-bold gap-1 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 border-emerald-200 hover:border-emerald-300 transition-all"
                  onClick={() => contactSupport(o)}
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  {t("مساعدة VIP بالواتساب", "VIP WhatsApp Help")}
                </Button>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
