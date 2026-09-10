import { formatDate, formatMoney } from "@/lib/format";

type ThermalItem = {
  description: string;
  quantity: number;
  unit_price: number;
  customization_total: number;
  line_total: number;
  customizations?: { name: string; price_delta: number }[];
  selected_variant?: {
    size?: string | null;
    color?: string | null;
    fabric?: string | null;
  } | null;
  custom_field_values?: Array<{
    key?: string;
    label_ar?: string | null;
    label_en?: string | null;
    value: string;
  }> | null;
};

type ThermalArgs = {
  brand: string;
  invoiceNumber: string | number;
  orderDate: string;
  status: string;
  customerName?: string | null;
  customerPhone?: string | null;
  paymentMethod?: string | null;
  items: ThermalItem[];
  subtotal: number;
  discount: number;
  taxRate: number;
  taxAmount: number;
  shipping: number;
  total: number;
  currency: string;
  lang: "en" | "ar";
  labels: {
    receipt: string;
    invoiceNumber: string;
    date: string;
    status: string;
    payment: string;
    customer: string;
    item: string;
    qty: string;
    price: string;
    total: string;
    subtotal: string;
    discount: string;
    vat: string;
    shipping: string;
    grandTotal: string;
    thankYou: string;
  };
  footerNote?: string | null;
};

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function printThermalReceipt(a: ThermalArgs) {
  const isRTL = a.lang === "ar";
  const locale = isRTL ? "ar-BH-u-nu-latn" : "en-US";
  const money = (n: number) => escapeHtml(formatMoney(n, a.currency, locale));

  const itemsHtml = a.items
    .map((it) => {
      const unit = Number(it.unit_price) + Number(it.customization_total);
      const variantParts = [
        it.selected_variant?.color && `${isRTL ? "اللون" : "Color"}: ${escapeHtml(it.selected_variant.color)}`,
        it.selected_variant?.size && `${isRTL ? "المقاس" : "Size"}: ${escapeHtml(it.selected_variant.size)}`,
        it.selected_variant?.fabric && `${isRTL ? "القماش" : "Fabric"}: ${escapeHtml(it.selected_variant.fabric)}`,
      ].filter(Boolean);

      const variantHtml = variantParts.length > 0
        ? `<div class="variant-meta" style="font-size:10px;opacity:0.85;">${variantParts.join(" · ")}</div>`
        : "";

      const customFieldsHtml = (it.custom_field_values ?? []).length > 0
        ? `<div class="custom-fields" style="font-size:10px;opacity:0.85;">${(it.custom_field_values ?? [])
            .map((cf) => `${escapeHtml((isRTL ? cf.label_ar || cf.label_en : cf.label_en || cf.label_ar) || cf.key || "")}: ${escapeHtml(cf.value)}`)
            .join("<br/>")}</div>`
        : "";

      const addons =
        (it.customizations ?? []).length > 0
          ? `<div class="addons">${it
              .customizations!.map((c) => `+ ${escapeHtml(c.name)} (${money(c.price_delta)})`)
              .join("<br/>")}</div>`
          : "";
      return `
        <tr>
          <td class="desc">
            <div>${escapeHtml(it.description || "—")}</div>
            ${variantHtml}
            ${customFieldsHtml}
            ${addons}
          </td>
          <td class="qty">${it.quantity}</td>
          <td class="price">${money(unit)}</td>
          <td class="tot">${money(it.line_total)}</td>
        </tr>`;
    })
    .join("");

  const rows: [string, string][] = [[a.labels.subtotal, money(a.subtotal)]];
  if (a.discount > 0) rows.push([a.labels.discount, `- ${money(a.discount)}`]);
  if (a.taxRate > 0) rows.push([`${a.labels.vat} (${a.taxRate}%)`, money(a.taxAmount)]);
  if (a.shipping > 0) rows.push([a.labels.shipping, money(a.shipping)]);

  const totalsHtml = rows
    .map(([k, v]) => `<div class="row"><span>${escapeHtml(k)}</span><span>${v}</span></div>`)
    .join("");

  const dateStr = escapeHtml(formatDate(a.orderDate, locale));

  const html = `<!doctype html>
<html lang="${a.lang}" dir="${isRTL ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(a.brand)} — #${escapeHtml(String(a.invoiceNumber))}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body {
    width: 80mm;
    padding: 4mm 3mm;
    font-family: ${isRTL ? "'Tajawal','Cairo',sans-serif" : "'Menlo','Consolas','Courier New',monospace"};
    font-size: 12px;
    line-height: 1.35;
  }
  .center { text-align: center; }
  .brand { font-size: 18px; font-weight: 700; letter-spacing: 1px; margin: 0; }
  .muted { color: #444; font-size: 11px; }
  hr.dash { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
  .meta { font-size: 11px; }
  .meta div { display: flex; justify-content: space-between; gap: 6px; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th, td { padding: 3px 0; vertical-align: top; font-size: 11px; }
  th { text-align: ${isRTL ? "right" : "left"}; border-bottom: 1px solid #000; }
  th.qty, th.price, th.tot, td.qty, td.price, td.tot { text-align: ${isRTL ? "left" : "right"}; white-space: nowrap; }
  td.desc { word-break: break-word; }
  .addons { color: #333; font-size: 10px; margin-top: 2px; }
  .totals { margin-top: 4px; font-size: 12px; }
  .row { display: flex; justify-content: space-between; padding: 2px 0; }
  .grand { border-top: 1px solid #000; margin-top: 4px; padding-top: 4px; font-weight: 700; font-size: 14px; }
  .footer { margin-top: 8px; text-align: center; font-size: 11px; }
  @media print { body { padding: 3mm 2mm; } }
</style>
</head>
<body>
  <div class="center">
    <h1 class="brand">${escapeHtml(a.brand)}</h1>
    ${a.footerNote ? `<div class="muted">${escapeHtml(a.footerNote)}</div>` : ""}
  </div>
  <hr class="dash" />
  <div class="meta">
    <div><span>${escapeHtml(a.labels.invoiceNumber)}</span><span>#${escapeHtml(String(a.invoiceNumber))}</span></div>
    <div><span>${escapeHtml(a.labels.date)}</span><span>${dateStr}</span></div>
    <div><span>${escapeHtml(a.labels.status)}</span><span>${escapeHtml(a.status)}</span></div>
    ${a.paymentMethod ? `<div><span>${escapeHtml(a.labels.payment)}</span><span>${escapeHtml(a.paymentMethod)}</span></div>` : ""}
  </div>
  ${
    a.customerName || a.customerPhone
      ? `<hr class="dash" /><div class="muted"><strong>${escapeHtml(a.labels.customer)}:</strong> ${escapeHtml(a.customerName ?? "")}${a.customerPhone ? `<br/>${escapeHtml(a.customerPhone)}` : ""}</div>`
      : ""
  }
  <hr class="dash" />
  <table>
    <thead>
      <tr>
        <th>${escapeHtml(a.labels.item)}</th>
        <th class="qty">${escapeHtml(a.labels.qty)}</th>
        <th class="price">${escapeHtml(a.labels.price)}</th>
        <th class="tot">${escapeHtml(a.labels.total)}</th>
      </tr>
    </thead>
    <tbody>${itemsHtml}</tbody>
  </table>
  <hr class="dash" />
  <div class="totals">
    ${totalsHtml}
    <div class="row grand"><span>${escapeHtml(a.labels.grandTotal)}</span><span>${money(a.total)}</span></div>
  </div>
  <div class="footer">${escapeHtml(a.labels.thankYou)}</div>
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { window.focus(); window.print(); }, 150);
    });
    window.addEventListener('afterprint', function () { window.close(); });
  </script>
</body>
</html>`;

  const w = window.open("", "_blank", "width=380,height=720");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}

export type DeliveryNoteArgs = {
  brand: string;
  orderNumber: string | number;
  orderDate: string;
  fulfillmentStatus?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  deliveryAddress?: string | null;
  courierName?: string | null;
  deliveryNotes?: string | null;
  items: Array<{
    description: string;
    quantity: number;
    selected_variant?: {
      size?: string | null;
      color?: string | null;
      fabric?: string | null;
    } | null;
  }>;
  isPaid: boolean;
  balanceDue?: number;
  currency?: string;
  lang: "en" | "ar";
};

export function printDeliveryNote(a: DeliveryNoteArgs) {
  const isRTL = a.lang === "ar";
  const locale = isRTL ? "ar-BH-u-nu-latn" : "en-US";
  const currency = a.currency || "BHD";

  const itemsRows = a.items
    .map((it, idx) => {
      const variantParts = [
        it.selected_variant?.color && `${isRTL ? "اللون" : "Color"}: ${escapeHtml(it.selected_variant.color)}`,
        it.selected_variant?.size && `${isRTL ? "المقاس" : "Size"}: ${escapeHtml(it.selected_variant.size)}`,
        it.selected_variant?.fabric && `${isRTL ? "القماش" : "Fabric"}: ${escapeHtml(it.selected_variant.fabric)}`,
      ].filter(Boolean);

      const variantHtml = variantParts.length > 0
        ? `<div style="font-size:11px;color:#666;margin-top:2px;">${variantParts.join(" · ")}</div>`
        : "";

      return `
        <tr style="border-bottom:1px solid #e5e7eb;">
          <td style="padding:8px 6px;text-align:center;font-size:11px;color:#888;">${idx + 1}</td>
          <td style="padding:8px 6px;font-size:12px;font-weight:600;color:#111;">
            ${escapeHtml(it.description)}
            ${variantHtml}
          </td>
          <td style="padding:8px 6px;text-align:center;font-size:13px;font-weight:700;">${it.quantity}</td>
          <td style="padding:8px 6px;text-align:center;">
            <div style="width:16px;height:16px;border:1.5px solid #999;border-radius:3px;margin:auto;"></div>
          </td>
        </tr>`;
    })
    .join("");

  const paymentAlertHtml = a.isPaid
    ? `<div style="margin:12px 0;padding:10px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;color:#065f46;font-size:12px;font-weight:bold;text-align:center;">
        ✓ ${isRTL ? "مدفوع مسبقاً بالكامل — لا تقم بتحصيل أي مبالغ من العميل" : "Prepaid in Full — Do NOT collect payment from customer"}
       </div>`
    : `<div style="margin:12px 0;padding:10px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;color:#991b1b;font-size:13px;font-weight:bold;text-align:center;">
        ⚠️ ${isRTL ? "المبلغ المطلوب تحصيله عند التسليم" : "Amount to collect on delivery"}:
        <span style="font-size:15px;display:block;margin-top:4px;">${escapeHtml(formatMoney(a.balanceDue ?? 0, currency, locale))}</span>
       </div>`;

  const html = `<!DOCTYPE html>
<html dir="${isRTL ? "rtl" : "ltr"}" lang="${a.lang}">
<head>
  <meta charset="utf-8" />
  <title>${isRTL ? "إذن تسليم وبوليصة شحن" : "Delivery Note"} #${escapeHtml(String(a.orderNumber))}</title>
  <style>
    @page { size: A4; margin: 15mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111; margin: 0; padding: 20px; font-size: 13px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 16px; }
    .brand { font-size: 20px; font-weight: 800; letter-spacing: -0.5px; }
    .doc-title { font-size: 16px; font-weight: 700; color: #444; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
    .card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; }
    .card-title { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #6b7280; margin-bottom: 6px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th { background: #f3f4f6; padding: 8px 6px; font-size: 11px; text-transform: uppercase; color: #4b5563; border-bottom: 2px solid #d1d5db; }
    .signature-box { margin-top: 30px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .sign-line { border-top: 1px dashed #9ca3af; padding-top: 6px; font-size: 11px; color: #6b7280; text-align: center; margin-top: 40px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">${escapeHtml(a.brand)}</div>
      <div style="font-size:12px;color:#6b7280;margin-top:2px;">${escapeHtml(a.orderDate)}</div>
    </div>
    <div style="text-align:${isRTL ? "left" : "right"};">
      <div class="doc-title">${isRTL ? "إذن تسليم وبوليصة شحن" : "DELIVERY NOTE"}</div>
      <div style="font-size:14px;font-weight:700;font-family:monospace;margin-top:2px;">#${escapeHtml(String(a.orderNumber))}</div>
    </div>
  </div>

  <div class="grid">
    <div class="card">
      <div class="card-title">${isRTL ? "بيانات العميل والتوصيل" : "Customer & Destination"}</div>
      <div style="font-size:13px;font-weight:700;">${escapeHtml(a.customerName || (isRTL ? "عميل غير مسجل" : "Guest Customer"))}</div>
      ${a.customerPhone ? `<div style="font-size:12px;font-family:monospace;margin-top:2px;">📞 ${escapeHtml(a.customerPhone)}</div>` : ""}
      <div style="font-size:12px;color:#374151;margin-top:4px;">📍 ${escapeHtml(a.deliveryAddress || (isRTL ? "استلام من المحل" : "Store Pickup"))}</div>
    </div>

    <div class="card">
      <div class="card-title">${isRTL ? "بيانات المندوب وملاحظات السائق" : "Courier & Driver Trace"}</div>
      <div style="font-size:12px;font-weight:600;">🛵 ${escapeHtml(a.courierName || (isRTL ? "لم يتم التعيين بعد" : "Unassigned"))}</div>
      ${
        a.deliveryNotes
          ? `<div style="margin-top:6px;padding:6px;background:#fff;border:1px solid #d1d5db;border-radius:4px;font-size:11px;font-family:monospace;color:#1f2937;">
              <strong>${isRTL ? "ملاحظة السائق:" : "Driver Note:"}</strong> ${escapeHtml(a.deliveryNotes)}
             </div>`
          : `<div style="font-size:11px;color:#9ca3af;margin-top:4px;">${isRTL ? "لا توجد ملاحظات إضافية" : "No delivery instructions"}</div>`
      }
    </div>
  </div>

  ${paymentAlertHtml}

  <div style="margin-top:16px;">
    <div style="font-size:12px;font-weight:700;margin-bottom:6px;">${isRTL ? "محتويات الشحنة والتحقق:" : "Package Contents & Verification:"}</div>
    <table>
      <thead>
        <tr>
          <th style="width:30px;">#</th>
          <th style="text-align:${isRTL ? "right" : "left"};">${isRTL ? "المنتج / الوصف" : "Item / Description"}</th>
          <th style="width:60px;text-align:center;">${isRTL ? "الكمية" : "Qty"}</th>
          <th style="width:60px;text-align:center;">${isRTL ? "تم الفحص" : "Check"}</th>
        </tr>
      </thead>
      <tbody>
        ${itemsRows}
      </tbody>
    </table>
  </div>

  <div class="signature-box">
    <div>
      <div class="sign-line">${isRTL ? "توقيع المندوب / السائق" : "Courier Signature"}</div>
    </div>
    <div>
      <div class="sign-line">${isRTL ? "توقيع المستلم وتاريخ الاستلام" : "Recipient Signature & Date"}</div>
    </div>
  </div>

  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { window.focus(); window.print(); }, 150);
    });
    window.addEventListener('afterprint', function () { window.close(); });
  </script>
</body>
</html>`;

  const w = window.open("", "_blank", "width=800,height=900");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}

