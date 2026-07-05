import { createFileRoute, notFound } from "@tanstack/react-router";
import { getPublicInvoice } from "@/lib/public-invoice.functions";
import { useState } from "react";
import { formatMoney } from "@/lib/format";
import { formatAddressDetailed, regionLabel, type StructuredAddress } from "@/lib/bahrain-regions";
import { derivePaymentStatus, PAYMENT_BADGE_CLASSES, PAYMENT_BADGE_LABEL } from "@/lib/payment-status";

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
    const brand = loaderData?.settings?.business_name || "Pura";
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
  errorComponent: ({ error }) => (
    <div className="min-h-screen grid place-items-center bg-background px-4 text-center">
      <div>
        <h1 className="text-2xl font-display">Something went wrong</h1>
        <p className="text-sm text-muted-foreground mt-2">{error.message}</p>
      </div>
    </div>
  ),
});

const LABELS = {
  en: {
    invoice: "INVOICE", number: "Invoice #", date: "Date", status: "Status",
    billTo: "Bill to", delivery: "Delivery address", payment: "Payment method", vatId: "VAT",
    desc: "Description", qty: "Qty", unit: "Unit", total: "Total",
    subtotal: "Subtotal", discount: "Discount", vat: "VAT", shipping: "Shipping", grandTotal: "Grand Total",
    notes: "Notes", print: "Print", switchAr: "العربية", switchEn: "English",
  },
  ar: {
    invoice: "فاتورة", number: "رقم الفاتورة", date: "التاريخ", status: "الحالة",
    billTo: "فاتورة إلى", delivery: "عنوان التوصيل", payment: "طريقة الدفع", vatId: "الرقم الضريبي",
    desc: "الوصف", qty: "الكمية", unit: "سعر الوحدة", total: "الإجمالي",
    subtotal: "المجموع الفرعي", discount: "الخصم", vat: "ضريبة القيمة المضافة", shipping: "الشحن", grandTotal: "الإجمالي الكلي",
    notes: "ملاحظات", print: "طباعة", switchAr: "العربية", switchEn: "English",
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
  const { order, settings, shippingAddress } = Route.useLoaderData() as any;
  const [lang, setLang] = useState<"en" | "ar">("en");
  const L = LABELS[lang];
  const isRTL = lang === "ar";
  const locale = isRTL ? "ar-BH" : "en-US";
  const currency = order.currency ?? "SAR";
  const color = settings?.primary_color || "#8b6f47";
  const brand = settings?.business_name || (lang === "ar" ? "بيورا" : "Pura");
  const items = order.order_items ?? [];

  const money = (n: number) => formatMoney(Number(n || 0), currency, locale);

  const addrLine = shippingAddress
    ? formatAddressDetailed(shippingAddress as StructuredAddress, lang)
    : "";
  const legacyRegion = order.customers && (order.customers as any).region
    ? regionLabel((order.customers as any).region, lang) : "";

  return (
    <div dir={isRTL ? "rtl" : "ltr"} lang={lang} className="min-h-screen bg-neutral-100 py-6 px-3 sm:py-10 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="print:hidden mb-4 flex flex-wrap items-center justify-end gap-2">
          <div className="inline-flex rounded-md border border-neutral-300 bg-white overflow-hidden text-xs">
            <button onClick={() => setLang("en")} className={`px-3 py-1 ${lang === "en" ? "bg-neutral-900 text-white" : ""}`}>English</button>
            <button onClick={() => setLang("ar")} className={`px-3 py-1 ${lang === "ar" ? "bg-neutral-900 text-white" : ""}`}>العربية</button>
          </div>
          <button
            onClick={() => window.print()}
            className="px-3 py-1 text-xs rounded-md border border-neutral-300 bg-white hover:bg-neutral-50"
          >
            {L.print}
          </button>
        </div>

        <div
          className="rounded-lg shadow-lg bg-white overflow-hidden"
          style={{ borderTop: `6px solid ${color}`, fontFamily: isRTL ? `'Tajawal','Cairo',sans-serif` : `'Cormorant Garamond', serif` }}
        >
          <div className="p-5 sm:p-10">
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-8">
              <div className="min-w-0">
                {settings?.logo_url && (
                  <img src={settings.logo_url} alt="logo" className="h-14 object-contain mb-2" />
                )}
                <h2 style={{ color }} className="text-2xl font-semibold">{brand}</h2>
                {settings?.address && <p className="text-sm text-neutral-600 whitespace-pre-line mt-1">{settings.address}</p>}
                <p className="text-xs text-neutral-500 mt-1">
                  {[settings?.phone, settings?.email].filter(Boolean).join(" · ")}
                  {settings?.vat_number && ` · ${L.vatId} ${settings.vat_number}`}
                </p>
              </div>
              <div className={isRTL ? "text-start sm:text-start" : "text-start sm:text-end"}>
                <h1 style={{ color }} className="text-3xl sm:text-4xl font-semibold tracking-tight">{L.invoice}</h1>
                <p className="text-base mt-1">{L.number}: {order.invoice_number}</p>
                <p className="text-xs text-neutral-500 mt-2">{L.date}: {new Date(order.order_date).toLocaleDateString(locale)}</p>
                <p className="text-xs text-neutral-500">{L.status}: {STATUS[order.status]?.[lang] ?? order.status}</p>
                {order.payment_method && (
                  <p className="text-xs text-neutral-500">{L.payment}: {PAY[order.payment_method]?.[lang] ?? order.payment_method}</p>
                )}
              </div>
            </div>

            {order.customers && (
              <div className="mb-8">
                <p className="text-xs uppercase tracking-wider text-neutral-500 mb-1">{L.billTo}</p>
                <p className="font-medium">{order.customers.name}</p>
                {order.customers.phone && <p className="text-sm text-neutral-600">{order.customers.phone}</p>}
                {order.customers.email && <p className="text-sm text-neutral-600">{order.customers.email}</p>}
                {(addrLine || legacyRegion) && (
                  <div className="mt-3 pt-3 border-t border-neutral-200">
                    <p className="text-xs uppercase tracking-wider text-neutral-500 mb-1">{L.delivery}</p>
                    <p className="text-sm text-neutral-700">{addrLine || legacyRegion}</p>
                  </div>
                )}
              </div>
            )}

            <div className="-mx-2 sm:mx-0 overflow-x-auto">
              <table className="w-full min-w-[440px] text-sm mb-6">
                <thead>
                  <tr style={{ backgroundColor: color, color: "white" }}>
                    <th className="text-start p-3">{L.desc}</th>
                    <th className="text-end p-3 w-16">{L.qty}</th>
                    <th className="text-end p-3 w-24">{L.unit}</th>
                    <th className="text-end p-3 w-28">{L.total}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it: any, i: number) => (
                    <tr key={i} className="border-b border-neutral-200 align-top">
                      <td className="p-3">
                        <p className="font-medium">{it.description || "—"}</p>
                        {(it.customizations ?? []).length > 0 && (
                          <ul className="mt-1 text-xs text-neutral-600 space-y-0.5">
                            {it.customizations.map((c: any, ci: number) => (
                              <li key={ci}>+ {c.name} ({money(c.price_delta)})</li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="p-3 text-end">{it.quantity}</td>
                      <td className="p-3 text-end whitespace-nowrap">{money(Number(it.unit_price) + Number(it.customization_total))}</td>
                      <td className="p-3 text-end whitespace-nowrap font-medium">{money(it.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end">
              <div className="w-full sm:w-72 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-neutral-600">{L.subtotal}</span><span>{money(order.subtotal)}</span></div>
                {Number(order.discount) > 0 && <div className="flex justify-between"><span className="text-neutral-600">{L.discount}</span><span>− {money(order.discount)}</span></div>}
                {Number(order.tax_rate) > 0 && <div className="flex justify-between"><span className="text-neutral-600">{L.vat} ({order.tax_rate}%)</span><span>{money(order.tax_amount)}</span></div>}
                {Number(order.shipping) > 0 && <div className="flex justify-between"><span className="text-neutral-600">{L.shipping}</span><span>{money(order.shipping)}</span></div>}
                {(() => {
                  const badge = derivePaymentStatus(order.status, Number(order.total), Number(order.advance_paid ?? 0));
                  const advance = Number(order.advance_paid ?? 0);
                  const remaining = Math.max(0, Number(order.total) - advance);
                  return (
                    <>
                      <div className="flex justify-between items-center pt-2 border-t-2" style={{ borderColor: color }}>
                        <span className="text-lg" style={{ color }}>
                          {lang === "ar" ? "المبلغ الإجمالي" : "Total Amount"}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-lg" style={{ color }}>{money(order.total)}</span>
                          <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${PAYMENT_BADGE_CLASSES[badge]}`}>
                            {PAYMENT_BADGE_LABEL[badge][lang]}
                          </span>
                        </div>
                      </div>
                      {advance > 0 && (
                        <>
                          <div className="flex justify-between pt-1">
                            <span className="text-neutral-600">
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

            {(order.notes || settings?.footer_note) && (
              <div className="mt-8 pt-6 border-t border-neutral-200 text-sm text-neutral-600 space-y-2">
                {order.notes && <p><strong className="text-neutral-800">{L.notes}: </strong>{order.notes}</p>}
                {settings?.footer_note && <p className="italic">{settings.footer_note}</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
