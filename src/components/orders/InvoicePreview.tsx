import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { formatDate, formatMoney } from "@/lib/format";
import {
  getOrderCustomerName,
  getOrderCustomerPhone,
  getOrderCustomerEmail,
} from "@/lib/order-customer-snapshot";
import { getPaymentGatewayReference } from "@/lib/payment-reference";
import { getReadableTextColor } from "@/lib/color-utils";
import { getInvoiceStatusLabel, getFulfillmentLabel } from "@/lib/status-labels";

type SavedAddress = {
  id?: string;
  formatted_address?: string | null;
  address?: string | null;
};

type StructuredAddress = {
  block?: string | null;
  road?: string | null;
  building?: string | null;
  flat?: string | null;
  city?: string | null;
  area?: string | null;
};

type Customization = {
  name: string;
  price_delta: number;
};

type CustomFieldValue = {
  key: string;
  label_ar?: string | null;
  label_en?: string | null;
  value: string;
};

type Item = {
  description: string;
  quantity: number;
  unit_price: number;
  original_price?: number | null;
  line_total: number;
  customization_total: number;
  customizations: Customization[];
  selected_variant?: {
    size?: string | null;
    color?: string | null;
    fabric?: string | null;
  } | null;
  custom_field_values?: CustomFieldValue[];
};

type PaymentBadge = "paid" | "partial" | "unpaid" | "refunded";

function formatDeliveryAddress(c: any, lang: "en" | "ar"): string[] {
  if (!c) return [];
  const parts: string[] = [];
  if (c.block || c.road || c.building || c.flat) {
    const blockRoad = [
      c.flat && (lang === "ar" ? `شقة/مكتب ${c.flat}` : `Flat/Office ${c.flat}`),
      c.building && (lang === "ar" ? `مبنى ${c.building}` : `Bldg ${c.building}`),
      c.road && (lang === "ar" ? `طريق ${c.road}` : `Road ${c.road}`),
      c.block && (lang === "ar" ? `مجمع ${c.block}` : `Block ${c.block}`),
    ]
      .filter(Boolean)
      .join("، ");
    if (blockRoad) parts.push(blockRoad);
  }
  if (c.city || c.area) {
    const loc = [c.area, c.city].filter(Boolean).join("، ");
    if (loc) parts.push(loc);
  }
  if (c.address && parts.length === 0) {
    parts.push(c.address);
  }
  return parts;
}

function formatAddressDetailed(addr: StructuredAddress, lang: "en" | "ar"): string {
  if (!addr) return "";
  const parts = [
    addr.flat && (lang === "ar" ? `شقة/مكتب ${addr.flat}` : `Flat ${addr.flat}`),
    addr.building && (lang === "ar" ? `مبنى ${addr.building}` : `Bldg ${addr.building}`),
    addr.road && (lang === "ar" ? `طريق ${addr.road}` : `Road ${addr.road}`),
    addr.block && (lang === "ar" ? `مجمع ${addr.block}` : `Block ${addr.block}`),
    addr.area || addr.city,
  ].filter(Boolean);
  return parts.join("، ");
}

const INVOICE_LABELS = {
  en: {
    invoice: "INVOICE",
    invoiceNumber: "Invoice #",
    date: "Date",
    status: "Status",
    billTo: "Bill to",
    paymentMethod: "Payment method",
    vatLabel: "VAT",
    item: "Item",
    description: "Description",
    qty: "Qty",
    unit: "Unit Price",
    price: "Price",
    total: "Total",
    subtotal: "Subtotal",
    discount: "Discount",
    vat: "VAT",
    shipping: "Shipping",
    grandTotal: "Grand Total",
    notes: "Notes",
    warmRegards: "Warm regards",
    language: "Language",
    english: "English",
    arabic: "العربية",
  },
  ar: {
    invoice: "فاتورة",
    invoiceNumber: "رقم الفاتورة",
    date: "التاريخ",
    status: "الحالة",
    billTo: "فاتورة إلى",
    paymentMethod: "طريقة الدفع",
    vatLabel: "الرقم الضريبي",
    item: "الصنف",
    description: "الوصف",
    qty: "الكمية",
    unit: "سعر الوحدة",
    price: "السعر",
    total: "الإجمالي",
    subtotal: "المجموع الفرعي",
    discount: "الخصم",
    vat: "ضريبة القيمة المضافة",
    shipping: "الشحن",
    grandTotal: "الإجمالي الكلي",
    notes: "ملاحظات",
    warmRegards: "مع أطيب التحيات",
    language: "اللغة",
    english: "English",
    arabic: "العربية",
  },
} as const;

const BRAND: Record<"en" | "ar", string> = { en: "Boutq", ar: "بوتيك" };
const LEGACY_BRAND_NAMES = new Set(["Abaya Atelier", "أباية أتيليه"]);
function brandFor(lang: "en" | "ar", stored?: string | null) {
  const s = (stored ?? "").trim();
  if (!s || LEGACY_BRAND_NAMES.has(s)) return BRAND[lang];
  return s;
}

const PAYMENT_LABELS: Record<string, { en: string; ar: string }> = {
  cash: { en: "Cash", ar: "نقدًا" },
  card: { en: "Card", ar: "بطاقة" },
  bank_transfer: { en: "Bank transfer", ar: "تحويل بنكي" },
  transfer: { en: "Bank transfer", ar: "تحويل بنكي" },
  benefit: { en: "Benefit", ar: "بنفت" },
  apple_pay: { en: "Apple Pay", ar: "أبل باي" },
  google_pay: { en: "Google Pay", ar: "جوجل باي" },
  cod: { en: "Cash on delivery", ar: "الدفع عند الاستلام" },
};

function tPayment(s: string | null | undefined, lang: "en" | "ar") {
  if (!s) return "";
  return PAYMENT_LABELS[s]?.[lang] ?? s;
}

function toArabicDigits(str: string) {
  const map = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
  return str.replace(/[0-9]/g, (d) => map[+d]);
}

const PAYMENT_BADGE_CLASSES = {
  paid: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300",
  partial: "bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300",
  unpaid: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300",
  refunded: "bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300",
} as const;

const PAYMENT_BADGE_LABEL = {
  paid: { ar: "مدفوع بالكامل", en: "Fully Paid" },
  partial: { ar: "مدفوع جزئياً", en: "Partially Paid" },
  unpaid: { ar: "غير مدفوع", en: "Unpaid / COD" },
  refunded: { ar: "مسترد", en: "Refunded" },
} as const;

function InvoiceBranchName({
  brandId,
  branchId,
  isRTL,
}: {
  brandId: string;
  branchId: string;
  isRTL: boolean;
}) {
  const q = useQuery({
    queryKey: ["branch", brandId, branchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("branches" as any)
        .select("name_ar, name_en, location_ar, location_en")
        .eq("id", branchId)
        .maybeSingle();
      return data as any;
    },
    enabled: !!branchId,
  });
  const b = q.data;
  if (!b) return null;
  const name = isRTL ? b.name_ar || b.name_en : b.name_en || b.name_ar;
  const loc = isRTL ? b.location_ar || b.location_en : b.location_en || b.location_ar;
  return (
    <p className="text-sm" style={{ opacity: 0.85 }}>
      {name}
      {loc ? ` — ${loc}` : ""}
    </p>
  );
}

export default function InvoicePreview({
  order,
  items,
  settings,
  shippingAddress,
  paymentBadge,
}: {
  order: any;
  items: Item[];
  settings: any;
  shippingAddress?: SavedAddress | null;
  paymentBadge?: PaymentBadge;
}) {
  const currency = order.currency;
  const color = settings.primary_color || "#8b6f47";
  const bg = settings.background_color || "#ffffff";
  const text = settings.text_color || "#1a1a1a";
  const fontSize = Number(settings.font_size) || 14;
  const logoX = Number(settings.logo_x) || 0;
  const logoY = Number(settings.logo_y) || 0;
  const logoW = Number(settings.logo_width) || 160;
  const logoH = Number(settings.logo_height) || 64;
  const template = settings.invoice_template || "modern";
  const secondary = settings.invoice_secondary_color || `${color}10`;

  const [invoiceLang, setInvoiceLang] = useState<"en" | "ar">("en");
  const L = INVOICE_LABELS[invoiceLang];
  const isRTL = invoiceLang === "ar";
  const locale = isRTL ? "ar-BH-u-nu-latn" : "en-US";
  const money = (n: number) => {
    const s = formatMoney(n, currency, locale);
    return isRTL ? toArabicDigits(s) : s;
  };
  const num = (n: number | string) => (isRTL ? toArabicDigits(String(n)) : String(n));

  const arabicFont = (settings as any).invoice_arabic_font_family || "Cairo";
  const family = isRTL
    ? `"${arabicFont}", "Tajawal", "Cairo", sans-serif`
    : settings.font_family === "Custom (uploaded)"
      ? "'InvoiceCustomFont', sans-serif"
      : `"${settings.font_family || "Cormorant Garamond"}", serif`;

  const rawStatus = order.fulfillment_status || order.status;
  const isPaidStatus =
    order.payment_status === "paid" || rawStatus === "delivered" || rawStatus === "completed";
  const isUnpaidStatus =
    order.payment_status === "unpaid" ||
    rawStatus === "cancelled" ||
    rawStatus === "payment_pending";

  const statusPaidColor = (settings as any).invoice_status_paid_color || "#16a34a";
  const statusUnpaidColor = (settings as any).invoice_status_unpaid_color || "#dc2626";
  const statusProgressColor = (settings as any).invoice_status_progress_color || color || "#d97706";

  const statusBadgeColor = isPaidStatus
    ? statusPaidColor
    : isUnpaidStatus
      ? statusUnpaidColor
      : statusProgressColor;

  const isDarkInvoice = getReadableTextColor(bg) === "#ffffff";
  const darkTextForSurface = isDarkInvoice ? (bg.startsWith("#") ? bg : "#4a1526") : "#0f172a";

  const rawTableBg = (settings as any).invoice_table_header_bg;
  const tableHeaderBg = rawTableBg || (isDarkInvoice ? `${color}25` : "#f8fafc");
  const customTableFg = (settings as any).invoice_table_header_fg;
  const tableHeaderFg =
    customTableFg &&
    getReadableTextColor(tableHeaderBg, darkTextForSurface, text) === darkTextForSurface
      ? getReadableTextColor(tableHeaderBg) === "#ffffff"
        ? "#ffffff"
        : darkTextForSurface
      : customTableFg || getReadableTextColor(tableHeaderBg, darkTextForSurface, text);

  const dividerColor =
    (settings as any).invoice_divider_color || (isDarkInvoice ? `${text}20` : "#e2e8f0");

  const surfaceCardTextColor = getReadableTextColor(secondary, darkTextForSurface, text);
  const badgeBg = secondary || `${statusBadgeColor}25`;
  const badgeTextColor = getReadableTextColor(badgeBg, darkTextForSurface, statusBadgeColor);

  return (
    <div className="space-y-2">
      <div className="print:hidden flex flex-wrap items-center justify-end gap-2">
        <Label className="text-xs text-muted-foreground">{L.language}:</Label>
        <div className="inline-flex rounded-md border border-input overflow-hidden">
          <button
            type="button"
            onClick={() => setInvoiceLang("en")}
            className={`px-3 py-1 text-xs ${invoiceLang === "en" ? "bg-primary text-primary-foreground" : "bg-background"}`}
          >
            {L.english}
          </button>
          <button
            type="button"
            onClick={() => setInvoiceLang("ar")}
            className={`px-3 py-1 text-xs ${invoiceLang === "ar" ? "bg-primary text-primary-foreground" : "bg-background"}`}
          >
            {L.arabic}
          </button>
        </div>
      </div>

      <div
        dir={isRTL ? "rtl" : "ltr"}
        lang={invoiceLang}
        className={`printable-invoice pdf-invoice-root overflow-hidden ${template === "minimal" ? "" : "rounded-lg border border-border shadow-lg"}`}
        style={
          {
            backgroundColor: bg,
            color: text,
            fontFamily: family,
            fontSize: `${fontSize}px`,
            printColorAdjust: "exact",
            WebkitPrintColorAdjust: "exact",
          } as any
        }
      >
        {settings.font_url && !isRTL && (
          <style>{`@font-face { font-family: 'InvoiceCustomFont'; src: url('${settings.font_url}'); font-display: swap; }`}</style>
        )}
        {isRTL && (
          <link
            rel="stylesheet"
            href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(arabicFont).replace(/%20/g, "+")}:wght@400;500;600;700&display=swap`}
          />
        )}
        <div
          className="pdf-invoice-body p-4 sm:p-8 md:p-10 print:p-10 relative"
          style={{
            position: "relative",
            borderTop:
              template === "minimal"
                ? "0"
                : template === "classic"
                  ? `2px solid ${color}`
                  : `8px solid ${color}`,
          }}
        >
          {order.payment_status === "paid" ? (
            <div className="absolute top-[10%] right-[10%] md:right-[15%] rotate-[-12deg] select-none pointer-events-none opacity-20 print:opacity-30 z-10">
              <div className="border-[6px] border-double border-emerald-600 text-emerald-600 font-extrabold text-2xl md:text-3xl tracking-widest uppercase py-2 px-6 rounded-xl font-sans flex flex-col items-center justify-center leading-none">
                <span>{invoiceLang === "ar" ? "مدفوع" : "PAID"}</span>
                {order.updated_at && (
                  <span className="text-[10px] md:text-xs font-semibold tracking-normal mt-1 opacity-90 font-mono">
                    {new Date(order.updated_at).toLocaleDateString(
                      invoiceLang === "ar" ? "ar-BH-u-nu-latn" : "en-BH",
                    )}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="absolute top-[10%] right-[10%] md:right-[15%] rotate-[-12deg] select-none pointer-events-none opacity-20 print:opacity-30 z-10">
              <div className="border-[6px] border-double border-rose-600 text-rose-600 font-extrabold text-2xl md:text-3xl tracking-widest uppercase py-2 px-6 rounded-xl font-sans flex flex-col items-center justify-center leading-none">
                <span>{invoiceLang === "ar" ? "غير مدفوع" : "UNPAID"}</span>
                <span className="text-[9px] md:text-[10px] font-semibold tracking-normal mt-1 uppercase font-mono text-center">
                  {invoiceLang === "ar" ? "الرجاء التحويل البنكي" : "Bank Transfer Req."}
                </span>
              </div>
            </div>
          )}

          <div className="pdf-invoice-header flex flex-row justify-between items-start mb-8 md:mb-10 gap-4 md:gap-6 print:flex-row">
            <div className="pdf-brand-block w-[48%] min-w-0" style={{ textAlign: "start" }}>
              {settings.logo_url && (
                <div
                  className="pdf-brand-logo-wrap relative mb-3 flex"
                  style={{ height: logoH + logoY + 8, justifyContent: "flex-start" }}
                >
                  <img
                    src={settings.logo_url}
                    alt="logo"
                    className="pdf-brand-logo"
                    draggable={false}
                    style={{
                      position: "absolute",
                      insetInlineStart: logoX,
                      top: logoY,
                      width: logoW,
                      height: logoH,
                      objectFit: "contain",
                    }}
                  />
                </div>
              )}
              <p className="font-semibold">{settings.business_name}</p>
              {settings.invoice_show_business_details !== false && (
                <div className="text-xs mt-1 space-y-0.5" style={{ opacity: 0.7 }}>
                  {settings.address && <p>{settings.address}</p>}
                  {settings.phone && (
                    <p
                      dir="ltr"
                      style={{ unicodeBidi: "isolate", textAlign: isRTL ? "right" : "left" }}
                    >
                      {settings.phone}
                    </p>
                  )}
                  {settings.email && (
                    <p
                      dir="ltr"
                      style={{ unicodeBidi: "isolate", textAlign: isRTL ? "right" : "left" }}
                    >
                      {settings.email}
                    </p>
                  )}
                  {settings.vat_number && (
                    <p>
                      {isRTL ? "الرقم الضريبي" : "VAT"}: {settings.vat_number}
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="pdf-meta-block w-[48%] min-w-0" style={{ textAlign: "end" }}>
              <h2
                className={`text-3xl sm:text-4xl font-display ${isRTL ? "" : "tracking-tight"}`}
                style={{
                  color,
                  letterSpacing: isRTL ? "normal" : undefined,
                  textTransform: "none",
                }}
              >
                {(isRTL ? settings.invoice_title_ar : settings.invoice_title_en) || L.invoice}
              </h2>
              <div className="flex items-center justify-end gap-2 flex-wrap mt-1">
                <p className="text-base sm:text-lg font-bold">
                  {L.invoiceNumber}: {num(order.invoice_number)}
                </p>
                <span
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold"
                  style={{
                    backgroundColor: badgeBg,
                    color: badgeTextColor,
                    border: `1px solid ${badgeTextColor}40`,
                  }}
                >
                  {getInvoiceStatusLabel(rawStatus, invoiceLang)}
                </span>
              </div>
              <p className="text-xs mt-2" style={{ opacity: 0.75 }}>
                {L.date}:{" "}
                {formatDate(
                  order.created_at ?? order.order_date,
                  isRTL ? "ar-BH-u-nu-latn" : "en-BH",
                )}
              </p>
              {order.payment_method && (
                <p className="text-xs" style={{ opacity: 0.75 }}>
                  {L.paymentMethod}: {tPayment(order.payment_method, invoiceLang)}
                </p>
              )}
              {getPaymentGatewayReference(order) && (
                <p
                  className="text-[10px] mt-1 break-all"
                  style={{
                    opacity: 0.5,
                    maxWidth: "180px",
                    marginLeft: isRTL ? "0" : "auto",
                    marginRight: isRTL ? "auto" : "0",
                  }}
                >
                  Ref: {getPaymentGatewayReference(order)}
                </p>
              )}
            </div>
          </div>

          {order.customers && (
            <div className="mb-8" style={{ textAlign: "start" }}>
              <p
                className={`text-xs mb-1 ${isRTL ? "" : "uppercase tracking-wider"}`}
                style={{ opacity: 0.6, letterSpacing: isRTL ? "normal" : undefined }}
              >
                {L.billTo}
              </p>
              <p className="font-medium">{getOrderCustomerName(order)}</p>
              {settings.invoice_show_customer_contact !== false && getOrderCustomerPhone(order) && (
                <p
                  dir="ltr"
                  className="text-sm"
                  style={{
                    opacity: 0.75,
                    unicodeBidi: "isolate",
                    textAlign: isRTL ? "right" : "left",
                  }}
                >
                  {num(getOrderCustomerPhone(order))}
                </p>
              )}
              {settings.invoice_show_customer_contact !== false && getOrderCustomerEmail(order) && (
                <p
                  dir="ltr"
                  className="text-sm"
                  style={{ opacity: 0.75, textAlign: isRTL ? "right" : "left" }}
                >
                  {getOrderCustomerEmail(order)}
                </p>
              )}
              {(() => {
                const detailed = shippingAddress
                  ? formatAddressDetailed(shippingAddress as StructuredAddress, invoiceLang)
                  : "";
                const legacy = !detailed ? formatDeliveryAddress(order.customers, invoiceLang) : [];
                if (!detailed && legacy.length === 0) return null;
                return (
                  <div className="mt-3 pt-3 border-t border-border">
                    <p
                      className={`text-xs mb-1 ${isRTL ? "" : "uppercase tracking-wider"}`}
                      style={{ opacity: 0.6, letterSpacing: isRTL ? "normal" : undefined }}
                    >
                      {isRTL ? "عنوان التوصيل" : "Delivery address"}
                    </p>
                    {detailed ? (
                      <p className="text-sm leading-relaxed" style={{ opacity: 0.85 }}>
                        {isRTL ? toArabicDigits(detailed) : detailed}
                      </p>
                    ) : (
                      legacy.map((l, i) => (
                        <p
                          key={i}
                          className="text-sm whitespace-pre-line"
                          style={{ opacity: 0.85 }}
                        >
                          {isRTL ? toArabicDigits(l) : l}
                        </p>
                      ))
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {settings.invoice_show_fulfillment !== false &&
            (order.fulfillment_method || order.branch_id) && (
              <div
                className="mb-6 rounded-lg p-4 text-sm"
                style={{ textAlign: "start", backgroundColor: secondary }}
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
                  <div
                    className="mt-2 text-xs"
                    style={{ color: surfaceCardTextColor, opacity: 0.85 }}
                  >
                    <p>
                      {order.digital_delivery_channel === "whatsapp"
                        ? isRTL
                          ? "واتساب"
                          : "WhatsApp"
                        : isRTL
                          ? "البريد الإلكتروني"
                          : "Email"}
                      : <span dir="ltr">{order.digital_delivery_contact || "—"}</span>
                    </p>
                  </div>
                )}
                {order.branch_id && (
                  <div
                    className="mt-1 text-xs font-medium"
                    style={{ color: surfaceCardTextColor, opacity: 0.85 }}
                  >
                    <InvoiceBranchName
                      brandId={order.brand_id}
                      branchId={order.branch_id}
                      isRTL={isRTL}
                    />
                  </div>
                )}
              </div>
            )}

          <div className="pdf-table-wrap -mx-4 sm:mx-0 overflow-x-auto print:overflow-visible print:mx-0">
            <table className="pdf-line-items w-full min-w-[520px] text-sm mb-6">
              <thead>
                <tr
                  style={{
                    backgroundColor: tableHeaderBg,
                    color: tableHeaderFg,
                    borderBottom: `1px solid ${dividerColor}`,
                  }}
                >
                  <th className="text-start p-3">{L.description}</th>
                  <th className="text-end p-3 w-16">{L.qty}</th>
                  <th className="text-end p-3 w-28">{L.unit}</th>
                  <th className="text-end p-3 w-28">{L.total}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr
                    key={i}
                    className="border-b align-top"
                    style={{ borderBottomColor: dividerColor }}
                  >
                    <td className="p-3 text-start">
                      {(() => {
                        const rawDesc = it.description || "—";
                        const lines = rawDesc
                          .split(/\r?\n/)
                          .map((s) => s.trim())
                          .filter(Boolean);
                        const primaryTitle = lines[0] || "—";
                        const secondaryParts = lines.slice(1);

                        // If primary title contains ' - ' e.g. "فستان داخلي مع كم - اسود - 55"
                        const hyphenParts = primaryTitle
                          .split(/\s+[-–—]\s+/)
                          .map((s) => s.trim())
                          .filter(Boolean);
                        let title = primaryTitle;
                        let inlineDetails: string | null = null;

                        if (hyphenParts.length > 1) {
                          title = hyphenParts[0];
                          inlineDetails = hyphenParts
                            .slice(1)
                            .map((p) => (/^\d+$/.test(p) ? (isRTL ? `مقاس ${p}` : `Size ${p}`) : p))
                            .join(" · ");
                        }

                        return (
                          <>
                            <p className="font-semibold" style={{ color: text }}>
                              {title}
                            </p>
                            {inlineDetails && (
                              <p
                                className="text-xs mt-0.5 font-normal"
                                style={{ color: text, opacity: 0.85 }}
                              >
                                {inlineDetails}
                              </p>
                            )}
                            {secondaryParts.length > 0 && (
                              <div
                                className="text-xs mt-0.5 leading-snug"
                                style={{ color: text, opacity: 0.75 }}
                              >
                                {secondaryParts.map((line, li) => (
                                  <div key={li}>{line}</div>
                                ))}
                              </div>
                            )}
                          </>
                        );
                      })()}
                      {it.customizations.length > 0 && (
                        <ul className="mt-1 text-xs space-y-0.5" style={{ opacity: 0.75 }}>
                          {it.customizations.map((c, ci) => (
                            <li key={ci}>
                              + {c.name} ({money(c.price_delta)})
                            </li>
                          ))}
                        </ul>
                      )}
                      {it.selected_variant &&
                        (it.selected_variant.size ||
                          it.selected_variant.color ||
                          it.selected_variant.fabric) && (
                          <p className="mt-1 text-xs" style={{ opacity: 0.75 }}>
                            {[
                              it.selected_variant.color &&
                                `${isRTL ? "اللون" : "Color"}: ${it.selected_variant.color}`,
                              it.selected_variant.size &&
                                `${isRTL ? "المقاس" : "Size"}: ${it.selected_variant.size}`,
                              it.selected_variant.fabric &&
                                `${isRTL ? "القماش" : "Fabric"}: ${it.selected_variant.fabric}`,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        )}
                      {it.custom_field_values && it.custom_field_values.length > 0 && (
                        <ul className="mt-1 text-xs space-y-0.5" style={{ opacity: 0.75 }}>
                          {it.custom_field_values.map((cf, ci) => (
                            <li key={ci}>
                              {isRTL
                                ? cf.label_ar || cf.label_en || cf.key
                                : cf.label_en || cf.label_ar || cf.key}
                              :{" "}
                              {cf.value.startsWith("http") ? (
                                <a
                                  href={cf.value}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-primary hover:underline font-semibold inline-flex items-center gap-1"
                                >
                                  📎 {isRTL ? "تحميل/عرض الملف" : "View File"}
                                </a>
                              ) : (
                                cf.value
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="p-3 text-end" style={{ color: text }}>
                      {num(it.quantity)}
                    </td>
                    <td className="p-3 text-end whitespace-nowrap" style={{ color: text }}>
                      {Number(it.original_price ?? 0) > Number(it.unit_price) ? (
                        <span className="inline-flex flex-col items-end leading-tight">
                          <span className="text-xs line-through" style={{ opacity: 0.6 }}>
                            {money(Number(it.original_price) + it.customization_total)}
                          </span>
                          <span>{money(it.unit_price + it.customization_total)}</span>
                        </span>
                      ) : (
                        money(it.unit_price + it.customization_total)
                      )}
                    </td>
                    <td
                      className="p-3 font-semibold text-end whitespace-nowrap"
                      style={{ color: text }}
                    >
                      {money(it.line_total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div
            className="pdf-totals-row flex"
            style={{ justifyContent: isRTL ? "flex-start" : "flex-end", direction: "ltr" }}
          >
            <div
              className="pdf-totals-block w-72 text-sm space-y-1.5"
              style={{ direction: isRTL ? "rtl" : "ltr" }}
            >
              <div className="flex justify-between">
                <span style={{ opacity: 0.75 }}>{L.subtotal}</span>
                <span>{money(order.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ opacity: 0.75 }}>
                  {L.vat} ({num(order.tax_rate ?? 0)}%)
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
              <div
                className="flex justify-between items-center py-2 px-2.5 rounded-lg mt-2 font-bold"
                style={{ backgroundColor: secondary, border: `1.5px solid ${color}40` }}
              >
                <span
                  className="font-display text-base sm:text-lg"
                  style={{ color: surfaceCardTextColor }}
                >
                  {invoiceLang === "ar" ? "المبلغ الإجمالي" : "Total Amount"}
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className="font-display text-lg sm:text-xl"
                    style={{ color: surfaceCardTextColor }}
                  >
                    {money(order.total)}
                  </span>
                  {paymentBadge && (
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${isRTL ? "" : "uppercase tracking-wider"}`}
                      style={{
                        backgroundColor: badgeBg,
                        color: badgeTextColor,
                        border: `1px solid ${badgeTextColor}40`,
                        letterSpacing: isRTL ? "normal" : undefined,
                      }}
                    >
                      {PAYMENT_BADGE_LABEL[paymentBadge][invoiceLang]}
                    </span>
                  )}
                </div>
              </div>
              {Number(order.advance_paid) > 0 && (
                <>
                  <div className="flex justify-between pt-1">
                    <span style={{ opacity: 0.75 }}>
                      {invoiceLang === "ar" ? "المبلغ المقدم المدفوع" : "Advance Paid"}
                    </span>
                    <span>− {money(order.advance_paid)}</span>
                  </div>
                  <div
                    className="flex justify-between items-center rounded-md px-2 py-1 mt-1 font-semibold"
                    style={{ backgroundColor: `${color}1a`, color }}
                  >
                    <span>{invoiceLang === "ar" ? "المتبقي للاستحقاق" : "Remaining Due"}</span>
                    <span>
                      {money(Math.max(0, Number(order.total) - Number(order.advance_paid)))}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {settings.invoice_show_notes !== false && (
            <div
              className="mt-10 pt-6 text-xs sm:text-sm space-y-3"
              style={{ borderTop: `1px solid ${dividerColor}` }}
            >
              {order.notes && (
                <p style={{ color: text, opacity: 0.85 }}>
                  <strong>{L.notes}: </strong>
                  {order.notes}
                </p>
              )}
              {settings.footer_note ? (
                <p className="italic" style={{ color: text, opacity: 0.85 }}>
                  {settings.footer_note}
                </p>
              ) : (
                <div
                  className="space-y-1 rounded-md p-3 text-xs leading-relaxed"
                  style={{ backgroundColor: secondary }}
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
              <p className="italic font-medium pt-1" style={{ color: text, opacity: 0.85 }}>
                {L.warmRegards},<br />
                {brandFor(invoiceLang, settings.business_name)}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
