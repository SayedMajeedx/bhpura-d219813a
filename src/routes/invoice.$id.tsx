import { createFileRoute, notFound } from "@tanstack/react-router";
import { getPublicInvoice } from "@/lib/public-invoice.functions";
import { useState } from "react";
import { formatDate, formatMoney } from "@/lib/format";
import { formatAddressDetailed, regionLabel, type StructuredAddress } from "@/lib/bahrain-regions";
import {
  resolvePaymentStatus,
  PAYMENT_BADGE_CLASSES,
  PAYMENT_BADGE_LABEL,
} from "@/lib/payment-status";
import { getInvoiceStatusLabel, getFulfillmentLabel } from "@/lib/status-labels";
import {
  getOrderCustomerEmail,
  getOrderCustomerName,
  getOrderCustomerPhone,
} from "@/lib/order-customer-snapshot";

import { getReadableTextColor } from "@/lib/color-utils";

export const Route = createFileRoute("/invoice/$id")({
  ssr: false,
  loader: async ({ params }) => {
    const res = await getPublicInvoice({ data: { id: params.id } });
    if (!res) throw notFound();
    return res;
  },
  component: PublicInvoice,
  head: ({ loaderData }) => {
    const inv = loaderData?.order?.invoice_number;
    const brand = loaderData?.settings?.business_name || "Boutq";
    const title = inv ? `Invoice #${inv} — ${brand}` : `Invoice — ${brand}`;
    return {
      meta: [
        { title },
        { name: "description", content: `Invoice from ${brand}.` },
        { name: "robots", content: "noindex, nofollow" },
        { property: "og:title", content: title },
        { property: "og:description", content: `Invoice from ${brand}.` },
        { property: "og:type", content: "website" },
      ],
    };
  },
  notFoundComponent: () => (
    <div className="min-h-screen grid place-items-center bg-background px-4 text-center">
      <div>
        <h1 className="text-2xl font-display">Invoice not found</h1>
        <p className="text-sm text-muted-foreground mt-2">This link is invalid or has expired.</p>
      </div>
    </div>
  ),
  errorComponent: ({ error }) => {
    if (typeof console !== "undefined") console.error("[invoice route] render error", error);
    return (
      <div className="min-h-screen grid place-items-center bg-background px-4 text-center">
        <div>
          <h1 className="text-2xl font-display">Something went wrong</h1>
          <p className="text-sm text-muted-foreground mt-2">
            This invoice couldn't be loaded. Please try again later.
          </p>
        </div>
      </div>
    );
  },
});

const LABELS = {
  en: {
    invoice: "INVOICE",
    number: "Invoice #",
    date: "Date",
    status: "Status",
    billTo: "Bill to",
    delivery: "Delivery address",
    payment: "Payment method",
    vatId: "VAT",
    desc: "Description",
    qty: "Qty",
    unit: "Unit",
    total: "Total",
    size: "Size",
    color: "Color",
    subtotal: "Subtotal",
    discount: "Discount",
    vat: "VAT",
    shipping: "Shipping",
    grandTotal: "Grand Total",
    notes: "Notes",
    print: "Download PDF",
    switchAr: "العربية",
    switchEn: "English",
  },
  ar: {
    invoice: "فاتورة",
    number: "رقم الفاتورة",
    date: "التاريخ",
    status: "الحالة",
    billTo: "فاتورة إلى",
    delivery: "عنوان التوصيل",
    payment: "طريقة الدفع",
    vatId: "الرقم الضريبي",
    desc: "الوصف",
    qty: "الكمية",
    unit: "سعر الوحدة",
    total: "الإجمالي",
    size: "المقاس",
    color: "اللون",
    subtotal: "المجموع الفرعي",
    discount: "الخصم",
    vat: "ضريبة القيمة المضافة",
    shipping: "الشحن",
    grandTotal: "الإجمالي الكلي",
    notes: "ملاحظات",
    print: "تحميل الفاتورة PDF",
    switchAr: "العربية",
    switchEn: "English",
  },
} as const;

const STATUS: Record<string, { en: string; ar: string }> = {
  draft: { en: "Draft", ar: "مسودة" },
  confirmed: { en: "Confirmed", ar: "مؤكدة" },
  paid: { en: "Paid", ar: "مدفوعة" },
  pending: { en: "Pending", ar: "قيد الانتظار" },
  shipped: { en: "Shipped", ar: "تم الشحن" },
  completed: { en: "Completed", ar: "مكتملة" },
  cancelled: { en: "Cancelled", ar: "ملغاة" },
};
const PAY: Record<string, { en: string; ar: string }> = {
  cash: { en: "Cash", ar: "نقدًا" },
  card: { en: "Card", ar: "بطاقة" },
  bank_transfer: { en: "Bank transfer", ar: "تحويل بنكي" },
  benefit: { en: "Benefit", ar: "بنفت" },
  apple_pay: { en: "Apple Pay", ar: "أبل باي" },
  google_pay: { en: "Google Pay", ar: "جوجل باي" },
  cod: { en: "Cash on delivery", ar: "الدفع عند الاستلام" },
};

function PublicInvoice() {
  const { order, settings, shippingAddress, branch } = Route.useLoaderData() as any;
  const [lang, setLang] = useState<"en" | "ar">("en");
  const [copied, setCopied] = useState(false);
  const L = LABELS[lang];
  const isRTL = lang === "ar";
  const locale = isRTL ? "ar-BH-u-nu-latn" : "en-BH";
  const currency = order.currency ?? "BHD";
  const color = settings?.primary_color || "#8b6f47";
  const textColor = settings?.text_color || "#1a1a1a";
  const bgColor = settings?.background_color || "#ffffff";
  const secondaryColor = settings?.invoice_secondary_color || `${color}10`;
  const template = settings?.invoice_template || "modern";
  const showBusiness = settings?.invoice_show_business_details !== false;
  const showContact = settings?.invoice_show_customer_contact !== false;
  const showFulfillment = settings?.invoice_show_fulfillment !== false;
  const showNotes = settings?.invoice_show_notes !== false;
  const invoiceTitle =
    (isRTL ? settings?.invoice_title_ar : settings?.invoice_title_en) || L.invoice;
  const items = order.order_items ?? [];

  const arabicFont = (settings as any)?.invoice_arabic_font_family || "Cairo";
  const rawStatus = order.fulfillment_status || order.status;
  const isPaidStatus =
    order.payment_status === "paid" || rawStatus === "delivered" || rawStatus === "completed";
  const isUnpaidStatus =
    order.payment_status === "unpaid" ||
    rawStatus === "cancelled" ||
    rawStatus === "payment_pending";

  const statusPaidColor = (settings as any)?.invoice_status_paid_color || "#16a34a";
  const statusUnpaidColor = (settings as any)?.invoice_status_unpaid_color || "#dc2626";
  const statusProgressColor =
    (settings as any)?.invoice_status_progress_color || color || "#d97706";

  const statusBadgeColor = isPaidStatus
    ? statusPaidColor
    : isUnpaidStatus
      ? statusUnpaidColor
      : statusProgressColor;

  const isDarkInvoice = getReadableTextColor(bgColor) === "#ffffff";
  const darkTextForSurface = isDarkInvoice
    ? bgColor.startsWith("#")
      ? bgColor
      : "#4a1526"
    : "#0f172a";

  const rawTableBg = (settings as any)?.invoice_table_header_bg;
  const tableHeaderBg = rawTableBg || (isDarkInvoice ? `${color}25` : "#f8fafc");

  const effectiveTableBg = rawTableBg || (isDarkInvoice ? bgColor : "#f8fafc");
  const isTableBgDark = getReadableTextColor(effectiveTableBg) === "#ffffff";
  const lightTextForTable = isDarkInvoice ? textColor || "#ffffff" : "#ffffff";
  const darkTextForTable = darkTextForSurface;

  const customTableFg = (settings as any)?.invoice_table_header_fg;
  let tableHeaderFg: string;

  if (customTableFg) {
    const customFgIsDark = getReadableTextColor(customTableFg) === "#0f172a";
    if (isTableBgDark && customFgIsDark) {
      tableHeaderFg = lightTextForTable;
    } else if (!isTableBgDark && !customFgIsDark) {
      tableHeaderFg = darkTextForTable;
    } else {
      tableHeaderFg = customTableFg;
    }
  } else {
    tableHeaderFg = isTableBgDark ? lightTextForTable : darkTextForTable;
  }

  const dividerColor =
    (settings as any)?.invoice_divider_color || (isDarkInvoice ? `${textColor}20` : "#e2e8f0");

  const surfaceCardTextColor = getReadableTextColor(secondaryColor, darkTextForSurface, textColor);
  const badgeBg = secondaryColor || `${statusBadgeColor}25`;
  const badgeTextColor = getReadableTextColor(badgeBg, darkTextForSurface, statusBadgeColor);

  const money = (n: number) => formatMoney(Number(n || 0), currency, locale);

  const addrLine = shippingAddress
    ? formatAddressDetailed(shippingAddress as StructuredAddress, lang)
    : "";
  const legacyRegion =
    order.customers && (order.customers as any).region
      ? regionLabel((order.customers as any).region, lang)
      : "";

  return (
    <div
      dir={isRTL ? "rtl" : "ltr"}
      lang={lang}
      className="min-h-screen bg-neutral-100 py-6 px-3 sm:py-10 sm:px-6"
    >
      {/* Browser print overrides removed — PDF is generated via html2pdf directly from the live DOM. */}
      <div className="mx-auto max-w-3xl">
        <div className="print:hidden mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
          <div>
            <p className="text-sm font-semibold">{settings?.business_name}</p>
            <p className="text-xs text-neutral-500">
              #{order.invoice_number} · {formatDate(order.created_at ?? order.order_date, locale)}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="inline-flex rounded-md border border-neutral-300 bg-white overflow-hidden text-xs">
              <button
                onClick={() => setLang("en")}
                className={`px-3 py-1 ${lang === "en" ? "bg-neutral-900 text-white" : ""}`}
              >
                English
              </button>
              <button
                onClick={() => setLang("ar")}
                className={`px-3 py-1 ${lang === "ar" ? "bg-neutral-900 text-white" : ""}`}
              >
                العربية
              </button>
            </div>
            <button
              onClick={async () => {
                const url = window.location.href;
                if (navigator.share) {
                  try {
                    await navigator.share({
                      title: `${invoiceTitle} #${order.invoice_number}`,
                      url,
                    });
                    return;
                  } catch {
                    /* copy fallback */
                  }
                }
                await navigator.clipboard.writeText(url);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1800);
              }}
              className="px-3 py-2 text-xs rounded-md border border-neutral-300 bg-white hover:bg-neutral-50"
            >
              {copied ? (isRTL ? "تم النسخ" : "Copied") : isRTL ? "مشاركة الرابط" : "Share link"}
            </button>
            <button
              onClick={async () => {
                try {
                  const el = document.querySelector<HTMLElement>(".invoice-card");
                  const { downloadInvoicePdf } = await import("@/lib/download-invoice-pdf");
                  await downloadInvoicePdf(el, `invoice-${order.invoice_number ?? order.id}`);
                } catch (err) {
                  console.error("PDF download failed", err);
                  alert((err as Error)?.message ?? "PDF download failed");
                }
              }}
              className="px-3.5 py-2 text-xs rounded-md font-semibold hover:opacity-90 transition-all shadow-xs"
              style={{
                backgroundColor: color,
                color: getReadableTextColor(color),
                border: `1px solid ${getReadableTextColor(color) === "#0f172a" ? "rgba(0,0,0,0.18)" : "transparent"}`,
              }}
            >
              {L.print}
            </button>
          </div>
        </div>

        <div
          className="invoice-card pdf-invoice-root rounded-lg shadow-lg overflow-hidden"
          style={{
            borderTop:
              template === "minimal"
                ? "0"
                : template === "classic"
                  ? `2px solid ${color}`
                  : `8px solid ${color}`,
            backgroundColor: bgColor,
            color: textColor,
            fontFamily: settings?.font_url
              ? `'PublicInvoiceCustom', sans-serif`
              : isRTL
                ? `"${arabicFont}", 'Tajawal', 'Cairo', sans-serif`
                : `"${settings?.font_family || "Cormorant Garamond"}", serif`,
          }}
        >
          {settings?.font_url && (
            <style>{`@font-face{font-family:'PublicInvoiceCustom';src:url('${settings.font_url}');font-display:swap}`}</style>
          )}
          {isRTL && (
            <link
              rel="stylesheet"
              href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(arabicFont).replace(/%20/g, "+")}:wght@400;500;600;700&display=swap`}
            />
          )}
          <div className="pdf-invoice-body p-5 sm:p-10">
            {/* Brand block always on the doc-start side (LTR=left, RTL=right);
                invoice metadata always on the doc-end side. Using natural
                flex-row + text-align:start/end lets the browser mirror the
                whole row automatically based on `dir`. */}
            <div className="pdf-invoice-header flex flex-row justify-between items-start gap-4 mb-8">
              <div className="pdf-brand-block w-[48%] min-w-0" style={{ textAlign: "start" }}>
                {settings?.logo_url && (
                  <img
                    src={settings.logo_url}
                    alt="logo"
                    className="pdf-brand-logo h-12 sm:h-14 max-w-full object-contain mb-2"
                    style={{ marginInlineEnd: "auto" }}
                  />
                )}
                <p className="font-semibold">{settings?.business_name}</p>
                {showBusiness && (
                  <div className="text-xs mt-1 space-y-0.5" style={{ opacity: 0.72 }}>
                    {settings?.address && <p>{settings.address}</p>}
                    {settings?.phone && (
                      <p
                        dir="ltr"
                        style={{ unicodeBidi: "isolate", textAlign: isRTL ? "right" : "left" }}
                      >
                        {settings.phone}
                      </p>
                    )}
                    {settings?.email && (
                      <p
                        dir="ltr"
                        style={{ unicodeBidi: "isolate", textAlign: isRTL ? "right" : "left" }}
                      >
                        {settings.email}
                      </p>
                    )}
                    {settings?.vat_number && (
                      <p>
                        {L.vatId}: {settings.vat_number}
                      </p>
                    )}
                  </div>
                )}
              </div>
              <div className="pdf-meta-block w-[48%] min-w-0" style={{ textAlign: "end" }}>
                <h1
                  style={{
                    color,
                    letterSpacing: isRTL ? "normal" : undefined,
                    textTransform: "none",
                  }}
                  className={`text-2xl sm:text-4xl font-semibold ${isRTL ? "" : "tracking-tight"}`}
                >
                  {invoiceTitle}
                </h1>
                <div className="flex items-center justify-end gap-2 flex-wrap mt-1">
                  <p className="text-sm sm:text-base font-bold">
                    {L.number}: {order.invoice_number}
                  </p>
                  <span
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold"
                    style={{
                      backgroundColor: badgeBg,
                      color: badgeTextColor,
                      border: `1px solid ${badgeTextColor}40`,
                    }}
                  >
                    {getInvoiceStatusLabel(rawStatus, lang)}
                  </span>
                </div>
                <p className="text-xs mt-2" style={{ opacity: 0.75 }}>
                  {L.date}: {formatDate(order.created_at ?? order.order_date, locale)}
                </p>
                {order.payment_method && (
                  <p className="text-xs mt-0.5" style={{ opacity: 0.75 }}>
                    {L.payment}: {PAY[order.payment_method]?.[lang] ?? order.payment_method}
                  </p>
                )}
              </div>
            </div>

            {showContact && (
              <div
                className="pdf-contact-block mb-8 pb-6 text-sm"
                style={{
                  borderBottom: `1px solid ${dividerColor}`,
                  textAlign: "start",
                }}
              >
                <p
                  className={`text-xs mb-1 font-semibold ${isRTL ? "" : "uppercase tracking-wider"}`}
                  style={{ opacity: 0.6, letterSpacing: isRTL ? "normal" : undefined }}
                >
                  {L.billTo}
                </p>
                <p className="font-bold text-base">
                  {order.customers?.name || order.customer_name || "—"}
                </p>
                {order.customers?.phone && (
                  <p
                    dir="ltr"
                    className="text-sm mt-0.5"
                    style={{ opacity: 0.75, textAlign: isRTL ? "right" : "left" }}
                  >
                    {order.customers.phone}
                  </p>
                )}
                {getOrderCustomerEmail(order) && (
                  <p
                    dir="ltr"
                    className="text-sm"
                    style={{ opacity: 0.75, textAlign: isRTL ? "right" : "left" }}
                  >
                    {getOrderCustomerEmail(order)}
                  </p>
                )}
                {(() => {
                  if (order.fulfillment_method === "pickup") return null;
                  const detailed = shippingAddress
                    ? formatAddressDetailed(shippingAddress as StructuredAddress, lang)
                    : "";
                  const addr = detailed || legacyRegion;
                  if (!addr) return null;
                  return (
                    <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${dividerColor}` }}>
                      <p
                        className={`text-xs mb-1 ${isRTL ? "" : "uppercase tracking-wider"}`}
                        style={{ opacity: 0.6, letterSpacing: isRTL ? "normal" : undefined }}
                      >
                        {isRTL ? "عنوان التوصيل" : "Delivery address"}
                      </p>
                      <p className="text-sm leading-relaxed" style={{ opacity: 0.85 }}>
                        {addr}
                      </p>
                    </div>
                  );
                })()}
              </div>
            )}

            {showFulfillment && (order.fulfillment_method || order.branch_id) && (
              <div
                className="mb-8 rounded-lg p-4 text-sm"
                style={{ backgroundColor: secondaryColor, textAlign: "start" }}
              >
                <div>
                  <p
                    className={`text-xs mb-1 ${isRTL ? "" : "uppercase tracking-wider"}`}
                    style={{
                      color: surfaceCardTextColor,
                      opacity: 0.7,
                      letterSpacing: isRTL ? "normal" : undefined,
                    }}
                  >
                    {isRTL ? "طريقة التسليم" : "Fulfillment Method"}
                  </p>
                  <p className="font-bold text-base" style={{ color: surfaceCardTextColor }}>
                    {order.fulfillment_method === "digital"
                      ? isRTL
                        ? "تسليم رقمي"
                        : "Digital delivery"
                      : order.fulfillment_method === "pickup"
                        ? isRTL
                          ? "استلام"
                          : "Pickup"
                        : isRTL
                          ? "توصيل للمنزل"
                          : "Home delivery"}
                  </p>
                </div>
                {order.fulfillment_method === "digital" && (
                  <p
                    dir="ltr"
                    className="mt-2 text-xs break-all"
                    style={{ color: surfaceCardTextColor, opacity: 0.85 }}
                  >
                    {order.digital_delivery_channel === "whatsapp" ? "WhatsApp" : "Email"}:{" "}
                    {order.digital_delivery_contact}
                  </p>
                )}
                {order.fulfillment_method === "pickup" && branch && (
                  <p
                    className="mt-1 text-xs"
                    style={{ color: surfaceCardTextColor, opacity: 0.85 }}
                  >
                    {isRTL ? branch.name_ar || branch.name_en : branch.name_en || branch.name_ar}
                    {(
                      isRTL
                        ? branch.location_ar || branch.location_en
                        : branch.location_en || branch.location_ar
                    )
                      ? ` — ${isRTL ? branch.location_ar || branch.location_en : branch.location_en || branch.location_ar}`
                      : ""}
                  </p>
                )}
                {order.fulfillment_method === "delivery" && (addrLine || legacyRegion) && (
                  <p
                    className="mt-1 text-xs"
                    style={{ color: surfaceCardTextColor, opacity: 0.85 }}
                  >
                    {addrLine || legacyRegion}
                  </p>
                )}
              </div>
            )}

            <div className="pdf-table-wrap -mx-2 sm:mx-0 overflow-x-auto">
              <table className="pdf-line-items w-full min-w-[440px] text-sm mb-6">
                <thead>
                  <tr
                    style={{
                      backgroundColor: tableHeaderBg,
                      color: tableHeaderFg,
                      borderBottom: `1px solid ${dividerColor}`,
                    }}
                  >
                    <th className="text-start p-3">{L.desc}</th>
                    <th className="text-end p-3 w-16">{L.qty}</th>
                    <th className="text-end p-3 w-24">{L.unit}</th>
                    <th className="text-end p-3 w-28">{L.total}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it: any, i: number) => {
                    const rawDesc = it.products?.name || it.description || "—";
                    const lines = rawDesc
                      .split(/\r?\n/)
                      .map((s: string) => s.trim())
                      .filter(Boolean);
                    const primaryTitle = lines[0] || "—";
                    const secondaryParts = lines.slice(1);

                    const hyphenParts = primaryTitle
                      .split(/\s+[-–—]\s+/)
                      .map((s: string) => s.trim())
                      .filter(Boolean);
                    let title = primaryTitle;
                    let inlineDetails: string | null = null;

                    if (hyphenParts.length > 1) {
                      title = hyphenParts[0];
                      inlineDetails = hyphenParts
                        .slice(1)
                        .map((p: string) =>
                          /^\d+$/.test(p) ? (isRTL ? `مقاس ${p}` : `Size ${p}`) : p,
                        )
                        .join(" · ");
                    }

                    return (
                      <tr
                        key={i}
                        className="border-b align-top"
                        style={{ borderBottomColor: dividerColor }}
                      >
                        <td className="p-3">
                          <div className="space-y-0.5">
                            <p className="font-semibold" style={{ color: textColor }}>
                              {title}
                            </p>
                            {inlineDetails && (
                              <p className="text-xs" style={{ color: textColor, opacity: 0.82 }}>
                                {inlineDetails}
                              </p>
                            )}
                            {secondaryParts.length > 0 && (
                              <div className="text-xs" style={{ color: textColor, opacity: 0.75 }}>
                                {secondaryParts.map((l: string, li: number) => (
                                  <div key={li}>{l}</div>
                                ))}
                              </div>
                            )}
                            {it.product_variants?.color && (
                              <p className="text-xs" style={{ color: textColor, opacity: 0.75 }}>
                                {L.color}: {it.product_variants.color}
                              </p>
                            )}
                            {it.product_variants?.size && (
                              <p className="text-xs" style={{ color: textColor, opacity: 0.75 }}>
                                {L.size}: {it.product_variants.size}
                              </p>
                            )}
                          </div>
                          {(it.customizations ?? []).length > 0 && (
                            <ul
                              className="mt-1 text-xs space-y-0.5"
                              style={{ color: textColor, opacity: 0.75 }}
                            >
                              {it.customizations.map((c: any, ci: number) => (
                                <li key={ci}>
                                  + {c.name} ({money(c.price_delta)})
                                </li>
                              ))}
                            </ul>
                          )}
                          {(it.custom_field_values ?? []).length > 0 && (
                            <div
                              className="mt-1 text-xs space-y-0.5"
                              style={{ color: textColor, opacity: 0.75 }}
                            >
                              {it.custom_field_values.map((field: any, fi: number) => (
                                <p key={fi}>
                                  {(isRTL
                                    ? field.label_ar || field.label_en
                                    : field.label_en || field.label_ar) || field.key}
                                  : {field.value}
                                </p>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-end" style={{ color: textColor }}>
                          {it.quantity}
                        </td>
                        <td className="p-3 text-end whitespace-nowrap" style={{ color: textColor }}>
                          {Number(it.original_price ?? 0) > Number(it.unit_price) ? (
                            <span className="inline-flex flex-col items-end leading-tight">
                              <span className="text-xs line-through" style={{ opacity: 0.6 }}>
                                {money(Number(it.original_price) + Number(it.customization_total))}
                              </span>
                              <span>
                                {money(Number(it.unit_price) + Number(it.customization_total))}
                              </span>
                            </span>
                          ) : (
                            money(Number(it.unit_price) + Number(it.customization_total))
                          )}
                        </td>
                        <td
                          className="p-3 text-end whitespace-nowrap font-semibold"
                          style={{ color: textColor }}
                        >
                          {money(it.line_total)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Totals block stays on the physical left side in both languages. */}
            <div
              className="pdf-totals-row flex"
              style={{ justifyContent: isRTL ? "flex-start" : "flex-end", direction: "ltr" }}
            >
              <div
                className="pdf-totals-block w-full sm:w-72 text-sm space-y-1.5"
                style={{ direction: isRTL ? "rtl" : "ltr" }}
              >
                <div className="flex justify-between">
                  <span style={{ opacity: 0.75 }}>{L.subtotal}</span>
                  <span>{money(order.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ opacity: 0.75 }}>
                    {L.vat} ({order.tax_rate ?? 0}%)
                  </span>
                  <span>{money(order.tax_amount ?? 0)}</span>
                </div>
                {Number(order.discount) > 0 && (
                  <div className="flex justify-between gap-4">
                    <span style={{ opacity: 0.75 }}>
                      {L.discount}
                      {order.promo_code ? ` (Promo: ${order.promo_code})` : ""}
                    </span>
                    <span>− {money(order.discount)}</span>
                  </div>
                )}
                {Number(order.shipping) > 0 && (
                  <div className="flex justify-between">
                    <span style={{ opacity: 0.75 }}>{L.shipping}</span>
                    <span>{money(order.shipping)}</span>
                  </div>
                )}
                {(() => {
                  const badge = resolvePaymentStatus(
                    order.payment_status,
                    order.status,
                    Number(order.total),
                    Number(order.advance_paid ?? 0),
                  );
                  const advance = Number(order.advance_paid ?? 0);
                  const remaining = Math.max(0, Number(order.total) - advance);
                  return (
                    <>
                      <div
                        className="flex justify-between items-center py-2 px-2.5 rounded-lg mt-2 font-bold"
                        style={{
                          backgroundColor: secondaryColor,
                          border: `1.5px solid ${color}40`,
                        }}
                      >
                        <span
                          className="text-base sm:text-lg"
                          style={{ color: surfaceCardTextColor }}
                        >
                          {lang === "ar" ? "المبلغ الإجمالي" : "Total Amount"}
                        </span>
                        <div className="flex items-center gap-2">
                          <span
                            className="text-lg sm:text-xl"
                            style={{ color: surfaceCardTextColor }}
                          >
                            {money(order.total)}
                          </span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${isRTL ? "" : "uppercase tracking-wider"}`}
                            style={{
                              backgroundColor: badgeBg,
                              color: badgeTextColor,
                              border: `1px solid ${badgeTextColor}40`,
                              letterSpacing: isRTL ? "normal" : undefined,
                            }}
                          >
                            {PAYMENT_BADGE_LABEL[badge][lang]}
                          </span>
                        </div>
                      </div>
                      {advance > 0 && (
                        <>
                          <div className="flex justify-between pt-1">
                            <span style={{ opacity: 0.75 }}>
                              {lang === "ar" ? "المبلغ المقدم المدفوع" : "Advance Paid"}
                            </span>
                            <span>− {money(advance)}</span>
                          </div>
                          <div
                            className="flex justify-between items-center rounded-md px-2 py-1 mt-1 font-semibold"
                            style={{ backgroundColor: `${color}1a`, color }}
                          >
                            <span>{lang === "ar" ? "المتبقي للاستحقاق" : "Remaining Due"}</span>
                            <span>{money(remaining)}</span>
                          </div>
                        </>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>

            {showNotes && (
              <div
                className="mt-8 pt-6 text-xs sm:text-sm space-y-3"
                style={{ borderTop: `1px solid ${dividerColor}` }}
              >
                {order.notes && (
                  <p style={{ color: textColor, opacity: 0.85 }}>
                    <strong>{L.notes}: </strong>
                    {order.notes}
                  </p>
                )}
                {settings?.footer_note ? (
                  <p className="italic" style={{ color: textColor, opacity: 0.85 }}>
                    {settings.footer_note}
                  </p>
                ) : (
                  <div
                    className="space-y-1 rounded-md p-3 text-xs leading-relaxed"
                    style={{ backgroundColor: secondaryColor }}
                  >
                    <p className="font-semibold" style={{ color: surfaceCardTextColor }}>
                      {isRTL ? "الشروط والأحكام" : "Terms & Conditions"}
                    </p>
                    <p style={{ color: surfaceCardTextColor, opacity: 0.88 }}>
                      {isRTL
                        ? "فترة الاستبدال والاسترجاع خلال 3 أيام من تاريخ الاستلام. القطع المفصلة خصيصاً غير قابلة للاسترجاع بعد البدء في التفصيل."
                        : "Exchange and return policy valid within 3 days of receipt. Custom-tailored products are non-refundable once tailoring has commenced."}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
