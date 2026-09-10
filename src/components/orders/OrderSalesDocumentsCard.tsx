import React from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  FileText,
  Truck,
  RotateCcw,
  Printer,
  Copy,
  Check,
  Share2,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { printDeliveryNote } from "@/lib/thermal-print";

interface OrderSalesDocumentsCardProps {
  order: any;
  items: any[];
  brand: any;
  currency: string;
  lang: "en" | "ar";
  slug: string;
  onPrintThermalReceipt?: () => void;
  onPrintInvoice?: () => void;
}

export const OrderSalesDocumentsCard: React.FC<OrderSalesDocumentsCardProps> = ({
  order,
  items,
  brand,
  currency,
  lang,
  slug,
  onPrintThermalReceipt,
  onPrintInvoice,
}) => {
  const isAr = lang === "ar";
  const [copiedInvoice, setCopiedInvoice] = React.useState(false);
  const brandId = brand?.id || order?.brand_id;

  // 1. Fetch linked return requests for this order
  const returnRequestsQ = useQuery({
    queryKey: ["order-return-requests", brandId, order?.id],
    enabled: Boolean(brandId && order?.id && order.id !== "new"),
    queryFn: async () => {
      const { data, error } = await (supabase.from("return_requests") as any)
        .select("id, return_number, type, status, refund_status, net_refund_amount, reason, created_at")
        .eq("brand_id", brandId)
        .eq("order_id", order.id)
        .order("created_at", { ascending: false });
      if (error) {
        console.warn("Could not query return_requests for order:", error);
        return [];
      }
      return data ?? [];
    },
  });

  const linkedReturns = returnRequestsQ.data ?? [];
  const publicInvoiceUrl = order?.public_invoice_token
    ? `${window.location.origin}/invoice/${order.public_invoice_token}`
    : null;

  const handleCopyInvoiceUrl = async () => {
    if (!publicInvoiceUrl) {
      toast.error(isAr ? "رابط الفاتورة العامة غير متوفر" : "Public invoice link unavailable");
      return;
    }
    try {
      await navigator.clipboard.writeText(publicInvoiceUrl);
      setCopiedInvoice(true);
      toast.success(isAr ? "تم نسخ رابط الفاتورة بنجاح" : "Invoice link copied to clipboard");
      setTimeout(() => setCopiedInvoice(false), 2000);
    } catch {
      toast.error(isAr ? "فشل نسخ الرابط" : "Failed to copy link");
    }
  };

  const handleShareWhatsAppInvoice = () => {
    if (!publicInvoiceUrl) return;
    const customerPhone = (order.customer_phone_snapshot || order.phone || "").replace(/\D/g, "");
    const msg = isAr
      ? `مرحباً، تفضل رابط فاتورة طلبك #${order.invoice_number || order.id?.slice(0, 8)} من ${brand?.name || "المتجر"}: ${publicInvoiceUrl}`
      : `Hello, here is the invoice for your order #${order.invoice_number || order.id?.slice(0, 8)} from ${brand?.name || "the store"}: ${publicInvoiceUrl}`;
    const url = customerPhone
      ? `https://wa.me/${customerPhone.startsWith("973") ? customerPhone : `973${customerPhone.replace(/^0+/, "")}`}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
  };

  const handlePrintDeliveryNote = () => {
    const formattedAddress = [
      order.customer_address_snapshot,
      order.address,
      order.region,
      order.city,
    ]
      .filter(Boolean)
      .join(", ");

    const balanceDue = Math.max(
      0,
      Number(order.total || 0) - Number(order.advance_paid ?? order.paid_amount ?? 0),
    );

    printDeliveryNote({
      brand: brand?.name || "Boutq Store",
      orderNumber: order.invoice_number || order.id?.slice(0, 8) || "—",
      orderDate: formatDate(order.created_at || new Date().toISOString(), lang),
      fulfillmentStatus: order.fulfillment_status || order.status,
      customerName: order.customer_name_snapshot || order.customer_name || null,
      customerPhone: order.customer_phone_snapshot || order.customer_phone || order.phone || null,
      deliveryAddress: formattedAddress || null,
      courierName: order.courier_name || null,
      deliveryNotes: order.delivery_notes || order.notes || null,
      items: (items || []).map((it) => ({
        description: it.title || it.product_title || it.name || it.description || "Item",
        quantity: Number(it.quantity || 1),
        selected_variant: it.selected_variant || null,
      })),
      isPaid: order.payment_status === "paid" || balanceDue <= 0,
      balanceDue,
      currency,
      lang,
    });
  };

  const total = Number(order?.total ?? order?.total_amount ?? 0);
  const advancePaid = Number(order?.advance_paid ?? order?.paid_amount ?? 0);
  const balanceDue = Math.max(0, total - advancePaid);
  const isPaid = order?.payment_status === "paid" || balanceDue <= 0;

  return (
    <Card id="sec-documents" className="scroll-mt-24 rounded-xl border border-border/70 bg-card p-4 sm:p-6 shadow-sm">
      <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between border-b border-border/50 pb-4">
        <div>
          <h3 className="font-display text-lg font-bold text-foreground flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            {isAr ? "سلسلة مستندات المبيعات" : "Sales Documents & Lifecycle Chain"}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isAr
              ? "عرض مترابط لطلب البيع، الفاتورة الضريبية، إذن التسليم، وإشعارات الإرجاع"
              : "Unified view connecting Sales Order, Tax Invoice, Delivery Note, and Returns"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Document 1: Sales Order */}
        <div className="rounded-xl border border-border/60 bg-muted/20 p-4 flex flex-col justify-between hover:border-primary/40 transition-colors">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-xs">
                  1
                </span>
                <span className="font-bold text-sm text-foreground">
                  {isAr ? "طلب البيع (Sales Order)" : "Sales Order"}
                </span>
              </div>
              <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
                #{order?.invoice_number || order?.id?.slice(0, 8)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              {isAr
                ? "عقد الشراء الأساسي الموثق بسلة المشتريات وتفاصيل الأصناف"
                : "Primary purchase contract recording items, options, and order date"}
            </p>
            <div className="space-y-1 text-xs mb-4">
              <div className="flex justify-between text-muted-foreground">
                <span>{isAr ? "التاريخ:" : "Date:"}</span>
                <span className="font-mono">{formatDate(order?.created_at, lang)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>{isAr ? "عدد الأصناف:" : "Items count:"}</span>
                <span className="font-semibold text-foreground">{items?.length || 0}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>{isAr ? "إجمالي الطلب:" : "Order Total:"}</span>
                <span className="font-mono font-bold text-foreground">
                  {formatMoney(total, currency, lang)}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-2 border-t border-border/40">
            {onPrintThermalReceipt && (
              <Button
                variant="outline"
                size="sm"
                onClick={onPrintThermalReceipt}
                className="h-8 flex-1 text-xs gap-1.5"
              >
                <Printer className="h-3.5 w-3.5 text-muted-foreground" />
                {isAr ? "إيصال حراري" : "Thermal"}
              </Button>
            )}
            {onPrintInvoice && (
              <Button
                variant="outline"
                size="sm"
                onClick={onPrintInvoice}
                className="h-8 flex-1 text-xs gap-1.5"
              >
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                {isAr ? "طباعة A4" : "Print A4"}
              </Button>
            )}
          </div>
        </div>

        {/* Document 2: Tax Invoice */}
        <div className="rounded-xl border border-border/60 bg-muted/20 p-4 flex flex-col justify-between hover:border-primary/40 transition-colors">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                  2
                </span>
                <span className="font-bold text-sm text-foreground">
                  {isAr ? "الفاتورة الضريبية (Tax Invoice)" : "Tax Invoice"}
                </span>
              </div>
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                  isPaid
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
                    : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20"
                }`}
              >
                {isPaid
                  ? isAr ? "مدفوعة بالكامل" : "Paid in Full"
                  : isAr ? `مستحق: ${formatMoney(balanceDue, currency, lang)}` : `Due: ${formatMoney(balanceDue, currency, lang)}`}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              {isAr
                ? "فاتورة ضريبية رسمية للعميل مع احتساب الضريبة والدفعات"
                : "Official customer tax invoice with VAT, discounts, and payment proofs"}
            </p>
            <div className="space-y-1 text-xs mb-4">
              <div className="flex justify-between text-muted-foreground">
                <span>{isAr ? "حالة الدفع:" : "Payment status:"}</span>
                <span className="font-semibold text-foreground capitalize">
                  {order?.payment_status || "unpaid"}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>{isAr ? "الضريبة (VAT):" : "Tax amount:"}</span>
                <span className="font-mono">{formatMoney(Number(order?.tax_amount || 0), currency, lang)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>{isAr ? "المدفوع:" : "Paid advance:"}</span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400">
                  {formatMoney(advancePaid, currency, lang)}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-2 border-t border-border/40">
            {publicInvoiceUrl ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyInvoiceUrl}
                  className="h-8 flex-1 text-xs gap-1.5"
                >
                  {copiedInvoice ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  {copiedInvoice ? (isAr ? "تم النسخ" : "Copied") : (isAr ? "نسخ الرابط" : "Copy Link")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleShareWhatsAppInvoice}
                  className="h-8 flex-1 text-xs gap-1.5 text-emerald-700 dark:text-emerald-400 hover:text-emerald-800"
                >
                  <Share2 className="h-3.5 w-3.5" />
                  {isAr ? "مشاركة واتساب" : "WhatsApp"}
                </Button>
              </>
            ) : (
              <span className="text-xs text-muted-foreground italic py-1">
                {isAr ? "سيتم توليد الرابط عند الحفظ" : "Invoice link generated upon saving"}
              </span>
            )}
          </div>
        </div>

        {/* Document 3: Delivery Note */}
        <div className="rounded-xl border border-border/60 bg-muted/20 p-4 flex flex-col justify-between hover:border-primary/40 transition-colors">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold text-xs">
                  3
                </span>
                <span className="font-bold text-sm text-foreground">
                  {isAr ? "إذن التسليم وبوليصة الشحن" : "Delivery Note & Consignment"}
                </span>
              </div>
              <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20">
                {order?.fulfillment_status || order?.status || "PENDING"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              {isAr
                ? "مستند سائق التوصيل والتسليم الميداني مع خانة توقيع المستلم"
                : "Courier dispatch document with address, driver notes, and sign-off area"}
            </p>
            <div className="space-y-1 text-xs mb-4">
              <div className="flex justify-between text-muted-foreground">
                <span>{isAr ? "المندوب المعين:" : "Assigned courier:"}</span>
                <span className="font-semibold text-foreground">
                  {order?.courier_name || (isAr ? "غير معين" : "Unassigned")}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>{isAr ? "طريقة الاستلام:" : "Fulfillment method:"}</span>
                <span className="font-semibold text-foreground capitalize">
                  {order?.fulfillment_method || "Delivery"}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>{isAr ? "ملاحظات التوصيل:" : "Driver instructions:"}</span>
                <span className="truncate max-w-[150px] font-mono text-xs text-foreground">
                  {order?.delivery_notes || (isAr ? "لا توجد ملاحظات" : "None")}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-2 border-t border-border/40">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrintDeliveryNote}
              className="h-8 w-full text-xs gap-1.5"
            >
              <Truck className="h-3.5 w-3.5 text-blue-600" />
              {isAr ? "طباعة إذن التسليم وبوليصة الشحن" : "Print Delivery Note"}
            </Button>
          </div>
        </div>

        {/* Document 4: Return & Credit Note */}
        <div className="rounded-xl border border-border/60 bg-muted/20 p-4 flex flex-col justify-between hover:border-primary/40 transition-colors">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold text-xs">
                  4
                </span>
                <span className="font-bold text-sm text-foreground">
                  {isAr ? "إشعار الإرجاع والاستبدال" : "Return & Credit Note"}
                </span>
              </div>
              {linkedReturns.length > 0 ? (
                <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                  {isAr ? `${linkedReturns.length} إرجاع مرتبط` : `${linkedReturns.length} return`}
                </span>
              ) : (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
                  {isAr ? "لا يوجد إرجاع" : "None"}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              {isAr
                ? "سجل تسوية القطع المرتجعة والمستبدلة ورد المبالغ أو أرصدة المتجر"
                : "Audit trail for returned/exchanged items, refunds, or store credits"}
            </p>
            {linkedReturns.length > 0 ? (
              <div className="space-y-2 mb-3">
                {linkedReturns.map((ret: any) => (
                  <div
                    key={ret.id}
                    className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-50/40 dark:bg-amber-950/20 p-2 text-xs"
                  >
                    <div>
                      <span className="font-mono font-bold text-foreground">
                        {ret.return_number || ret.id.slice(0, 8)}
                      </span>
                      <div className="text-xs text-muted-foreground">
                        {ret.reason || (isAr ? "طلب إرجاع" : "Return request")}
                      </div>
                    </div>
                    <div className="text-end">
                      <span className="font-mono font-bold text-destructive">
                        {formatMoney(ret.net_refund_amount || 0, currency, lang)}
                      </span>
                      <div className="text-xs font-semibold text-muted-foreground uppercase">
                        {ret.status}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-border/40 bg-background/50 p-3 text-xs text-muted-foreground mb-4 text-center">
                {isAr
                  ? "لم يتم تسجيل أي طلب إرجاع أو استبدال لهذا الطلب بعد"
                  : "No return or exchange requested for this order yet."}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 pt-2 border-t border-border/40">
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-8 w-full text-xs gap-1.5"
            >
              <Link to="/admin/b/$slug/returns" params={{ slug }}>
                <RotateCcw className="h-3.5 w-3.5 text-amber-600" />
                {isAr ? "فتح مركز المرتجعات والاستبدال" : "Open Returns Center"}
                <ArrowRight className="h-3 w-3 ms-auto" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
};