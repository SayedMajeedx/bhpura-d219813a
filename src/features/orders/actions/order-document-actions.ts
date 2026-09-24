import { toast } from "sonner";
import { formatOrderStatus } from "@/lib/format";
import { useT, useI18n } from "@/lib/i18n";
import { getOrderCustomerName, getOrderCustomerPhone } from "@/lib/order-customer-snapshot";
import { printThermalReceipt } from "@/lib/thermal-print";
import { useAdminStoreProfile } from "@/hooks/use-store-profile";
import type { Order } from "@/features/orders/types";
import { orderTotals } from "@/features/orders/lib/order-editor";
import type { OrderItem } from "@/features/orders/types";
import type { OrderDetailData } from "@/features/orders/hooks/use-order-detail-data";

/**
 * Share and print actions for a loaded order: copy the public invoice link,
 * download the A4 PDF, and print the thermal receipt. Not hooks: the order
 * editor creates them after its loading and error returns.
 */
export function createOrderDocumentActions({
  order,
  items,
  t,
  lang,
  settingsQ,
  productsQ,
  storeProfile,
  totals,
  currency,
}: {
  order: Order;
  items: OrderItem[];
  t: ReturnType<typeof useT>;
  lang: ReturnType<typeof useI18n>["lang"];
  settingsQ: OrderDetailData["settingsQ"];
  productsQ: OrderDetailData["productsQ"];
  storeProfile: ReturnType<typeof useAdminStoreProfile>["profile"];
  totals: ReturnType<typeof orderTotals>;
  currency: string;
}) {
  const copyLink = async () => {
    const url = `${window.location.origin}/invoice/${order.public_invoice_token}`;
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
      toast.success(t("orders.linkCopied"));
    } catch {
      toast.error(t("orders.linkFailed"));
    }
  };

  const handlePrintA4 = async () => {
    try {
      const el = document.querySelector<HTMLElement>(".printable-invoice");
      const { downloadInvoicePdf } = await import("@/lib/download-invoice-pdf");
      await downloadInvoicePdf(el, `invoice-${order.invoice_number ?? order.id}`);
    } catch (err) {
      console.error("PDF download failed", err);
      toast.error(
        (err as Error)?.message ?? (lang === "ar" ? "فشل تحميل ملف PDF" : "PDF download failed"),
      );
    }
  };

  const printReceipt = () => {
    const settings: any = settingsQ.data ?? {};
    const LEGACY_BRAND_NAMES = new Set(["Abaya Atelier", "أباية أتيليه"]);
    const rawBrand = (settings.business_name ?? "").trim();
    const brand =
      !rawBrand || LEGACY_BRAND_NAMES.has(rawBrand)
        ? lang === "ar"
          ? "بوتيك"
          : "Boutq"
        : rawBrand;

    const paymentLabel = order.payment_method ? t(`payment.${order.payment_method}`) : "";
    const statusLabel = formatOrderStatus(order.status, order.fulfillment_method, lang);

    const ok = printThermalReceipt({
      brand,
      invoiceNumber: order.invoice_number,
      orderDate: order.order_date,
      status: statusLabel,
      customerName: getOrderCustomerName(order) || null,
      customerPhone: getOrderCustomerPhone(order) || null,
      paymentMethod: paymentLabel || null,
      items: items.map((i) => ({
        description: i.description,
        quantity: i.quantity,
        unit_price: i.unit_price,
        customization_total: i.customization_total,
        line_total: i.line_total,
        customizations: i.customizations,
        selected_variant: i.selected_variant,
        custom_field_values: i.custom_field_values,
        product: (productsQ.data ?? []).find((p: any) => p.id === i.product_id),
      })),
      brandAddons: storeProfile.addons,
      storeVertical: storeProfile.vertical,
      subtotal: totals.subtotal,
      discount: totals.discount,
      taxRate: Number(order.tax_rate ?? 0),
      taxAmount: totals.taxAmount,
      shipping: totals.shipping,
      total: totals.total,
      currency,
      lang,
      labels: {
        receipt: t("orders.printReceipt"),
        invoiceNumber: t("orders.invoice") + " #",
        date: t("orders.date"),
        status: t("orders.status"),
        payment: t("orderDetail.paymentMethod"),
        customer: t("orderDetail.customer"),
        item: t("orderDetail.description"),
        qty: t("orderDetail.qty"),
        price: t("orderDetail.unitPrice"),
        total: t("orderDetail.total"),
        subtotal: t("orderDetail.subtotal"),
        discount: t("orderDetail.discount"),
        vat: t("orderDetail.vat"),
        shipping: t("orderDetail.shipping"),
        grandTotal: t("orderDetail.grandTotal"),
        thankYou:
          settings.footer_note?.trim() ||
          (lang === "ar" ? "شكراً لتسوّقكم معنا" : "Thank you for your order"),
      },
      footerNote: null,
    });
    if (!ok) toast.error(t("orders.popupBlocked"));
  };

  return { copyLink, handlePrintA4, printReceipt };
}
