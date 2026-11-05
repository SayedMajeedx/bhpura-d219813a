import { formatDate, formatMoney } from "@/lib/format";
import { orderNumberLabel, type OrderNumberFormat } from "@/lib/order-number";
import {
  jobSheetPieces,
  type JobSheetLine,
  type JobSheetPiece,
  type JobSheetProduct,
  type Lang,
} from "@/features/orders/lib/job-sheet";
import {
  isPieceLine,
  piecesLabel,
  type SupplierOrder,
  type SupplierOrderLine,
} from "./order-state";

/**
 * A supplier order as a document (the owner's request of 2026-11-04: a customer's piece sent to
 * the workshop is recorded on the supplier's order with what the order says, and the order can be
 * printed or sent). Each customer's piece carries its specification from the customer's order
 * line: the size or "made to measure", the options, the measurements, the customer's notes for
 * the workshop, the extras and the revision. The page names a customer's order by its number
 * only, never the customer, and shows prices only when asked. Pure.
 */

export type PieceSpec = JobSheetPiece;

/** Each customer's piece's specification, by the customer's order line it is made for. */
export function pieceSpecs(
  details: ReadonlyArray<JobSheetLine & { id: string }>,
  products: readonly JobSheetProduct[],
  options: { lang: Lang; brandAddons?: unknown[] | null; storeVertical?: string | null },
): Map<string, PieceSpec> {
  const specs = new Map<string, PieceSpec>();
  for (const detail of details) {
    // A piece sent is made to order, whatever its line says.
    const [piece] = jobSheetPieces([{ ...detail, location: "custom" }], products, {
      ...options,
      every: true,
    });
    if (piece) specs.set(detail.id, piece);
  }
  return specs;
}

/** The piece's specification in a few words: its options, then its measurements. */
export function specLine(spec: PieceSpec | null | undefined): string {
  if (!spec) return "";
  return [...spec.options, ...spec.details].map((row) => `${row.label}: ${row.value}`).join(" · ");
}

const WORDS = {
  ar: {
    title: "طلبية مورّد",
    supplier: "المورّد",
    date: "تاريخ الطلبية",
    due: "موعد التسليم",
    piece: "القطعة",
    qty: "الكمية",
    price: "السعر",
    total: "المجموع",
    grand: "المجموع الكلي",
    forOrder: "للطلب",
    revision: (n: number) => `النسخة ${n}`,
    notes: "ملاحظات للورشة",
    extras: "إضافات",
    orderNotes: "ملاحظات الطلبية",
    make: "تفصيل",
    fix: "تصليح",
    alteration: "تعديل",
    toPrice: "السعر يُضاف لاحقاً",
    received: "استلمه",
    supplierSign: "توقيع المورّد",
    date2: "التاريخ",
  },
  en: {
    title: "Purchase order",
    supplier: "Supplier",
    date: "Order date",
    due: "Due",
    piece: "Piece",
    qty: "Qty",
    price: "Price",
    total: "Total",
    grand: "Order total",
    forOrder: "For order",
    revision: (n: number) => `Revision ${n}`,
    notes: "Notes for the workshop",
    extras: "Extras",
    orderNotes: "Order notes",
    make: "Make",
    fix: "Fix",
    alteration: "Alteration",
    toPrice: "Price to be added",
    received: "Received by",
    supplierSign: "Supplier's signature",
    date2: "Date",
  },
} as const;

const e = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type PurchaseOrderSheet = {
  brand: string;
  order: Pick<
    SupplierOrder,
    "po_number" | "created_at" | "expected_at" | "vendor_name" | "notes" | "items" | "total_amount"
  >;
  /** Each customer's piece's specification, by its order line (`pieceSpecs`). */
  specs: ReadonlyMap<string, PieceSpec>;
  /** A stock piece's size, in the store's words. */
  sizeName: (variantId: string | null) => string;
  lang: Lang;
  /** The agreed prices, the costs that are not pieces and the total. */
  withPrices: boolean;
  currency: string;
  numberFormat?: OrderNumberFormat | null;
};

/** The supplier order's printable page (A4). */
export function purchaseOrderHtml(a: PurchaseOrderSheet): string {
  const w = WORDS[a.lang];
  const dir = a.lang === "ar" ? "rtl" : "ltr";
  const day = (value: string | null | undefined) =>
    value ? formatDate(value, a.lang === "ar" ? "ar-BH-u-nu-latn" : "en-GB") : "—";
  const money = (n: number) => formatMoney(n, a.currency, a.lang);
  const lines = [...a.order.items]
    .sort((x, y) => x.sort_order - y.sort_order)
    .filter((line) => a.withPrices || isPieceLine(line));
  const count = lines.filter(isPieceLine).reduce((sum, l) => sum + Number(l.quantity || 0), 0);

  const row = (line: SupplierOrderLine, index: number) => {
    const spec = line.order_item_id ? a.specs.get(line.order_item_id) : undefined;
    const work = line.order_item_id ? w[line.purpose ?? "make"] : "";
    const size = !line.order_item_id && line.variant_id ? a.sizeName(line.variant_id) : "";
    const forOrder = line.customer_order?.invoice_number
      ? `<span class="tag">${e(w.forOrder)} <b dir="ltr">${e(
          orderNumberLabel(line.customer_order.invoice_number, a.numberFormat),
        )}</b></span>`
      : "";
    const revision =
      line.line_revision && line.line_revision > 1
        ? `<span class="tag strong">${e(w.revision(line.line_revision))}</span>`
        : "";
    const specRows = spec
      ? [...spec.options, ...spec.details]
          .map((r) => `<span><i>${e(r.label)}:</i> <b dir="auto">${e(r.value)}</b></span>`)
          .join("")
      : "";
    const notes = spec?.notes.length
      ? `<div class="note"><i>${e(w.notes)}:</i> <span dir="auto">${spec.notes.map(e).join(" · ")}</span></div>`
      : "";
    const extras = spec?.extras.length
      ? `<div class="sub"><i>${e(w.extras)}:</i> <span dir="auto">${spec.extras.map(e).join(" · ")}</span></div>`
      : "";
    const workNote = line.work_note
      ? `<div class="note" dir="auto">${e(line.work_note)}</div>`
      : "";
    const price = !a.withPrices
      ? ""
      : line.price_pending
        ? `<td class="num" colspan="2"><span class="muted">${e(w.toPrice)}</span></td>`
        : `<td class="num">${e(money(Number(line.unit_cost)))}</td><td class="num">${e(
            money(Number(line.line_total)),
          )}</td>`;
    return `<tr>
      <td class="num">${index + 1}</td>
      <td>
        <div class="name"><span dir="auto">${e(spec?.title || line.description)}</span>${
          size ? ` <span class="muted">· ${e(size)}</span>` : ""
        }</div>
        ${work || forOrder || revision ? `<div class="tags">${work ? `<span class="tag">${e(work)}</span>` : ""}${forOrder}${revision}</div>` : ""}
        ${specRows ? `<div class="spec">${specRows}</div>` : ""}
        ${workNote}${notes}${extras}
      </td>
      <td class="num qty">${Number(line.quantity || 0)}</td>
      ${price}
    </tr>`;
  };

  const head = `<tr><th class="num">#</th><th>${e(w.piece)}</th><th class="num">${e(w.qty)}</th>${
    a.withPrices ? `<th class="num">${e(w.price)}</th><th class="num">${e(w.total)}</th>` : ""
  }</tr>`;
  const total = a.withPrices
    ? `<tfoot><tr><td colspan="4" class="end">${e(w.grand)}</td><td class="num"><b>${e(
        money(Number(a.order.total_amount)),
      )}</b></td></tr></tfoot>`
    : "";
  const orderNotes = a.order.notes?.trim()
    ? `<div class="order-notes"><i>${e(w.orderNotes)}:</i> <span dir="auto">${e(a.order.notes.trim())}</span></div>`
    : "";

  return `<!DOCTYPE html>
<html dir="${dir}" lang="${a.lang}">
<head>
  <meta charset="utf-8" />
  <title>${e(`${w.title} ${a.order.po_number}`)}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body { font-family: ${a.lang === "ar" ? "'Tajawal','Cairo'," : ""}-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: black; margin: 0; padding: 16px; font-size: 13px; line-height: 1.45; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 2px solid black; padding-bottom: 10px; margin-bottom: 12px; }
    .brand { font-size: 18px; font-weight: 800; }
    .doc { font-size: 20px; font-weight: 800; text-align: end; }
    .meta { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-bottom: 14px; }
    .meta div { border: 1px solid silver; border-radius: 6px; padding: 6px 8px; min-width: 0; }
    .meta span { display: block; font-size: 10px; color: dimgray; }
    .meta b { font-size: 13px; overflow-wrap: anywhere; }
    table { width: 100%; border-collapse: collapse; }
    th { font-size: 11px; color: dimgray; text-align: start; border-bottom: 1.5px solid black; padding: 6px 6px; }
    td { vertical-align: top; border-bottom: 1px solid gainsboro; padding: 8px 6px; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    .num { text-align: end; white-space: nowrap; width: 1%; }
    .qty { font-size: 16px; font-weight: 800; }
    .end { text-align: end; font-weight: 700; }
    .name { font-size: 14px; font-weight: 800; }
    .tags { display: flex; flex-wrap: wrap; gap: 4px; margin: 4px 0; }
    .tag { border: 1px solid silver; border-radius: 4px; padding: 0 6px; font-size: 11px; }
    .tag.strong { border: 1.5px solid black; font-weight: 800; }
    .spec { display: flex; flex-wrap: wrap; gap: 2px 14px; margin-top: 2px; }
    .spec i, .note i, .sub i, .order-notes i { font-style: normal; color: dimgray; }
    .note { margin-top: 4px; padding: 4px 8px; background: whitesmoke; border-radius: 4px; white-space: pre-wrap; }
    .sub { margin-top: 2px; }
    .muted { color: dimgray; font-weight: 400; }
    .order-notes { margin-top: 12px; white-space: pre-wrap; }
    .sign { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin-top: 28px; break-inside: avoid; }
    .sign div { font-size: 11px; color: dimgray; }
    .sign .blank { display: block; height: 26px; border-bottom: 1px dashed gray; margin-bottom: 4px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand" dir="auto">${e(a.brand)}</div>
    <div class="doc">${e(w.title)} <span dir="ltr">${e(a.order.po_number)}</span></div>
  </div>
  <div class="meta">
    <div><span>${e(w.supplier)}</span><b dir="auto">${e(a.order.vendor_name || "—")}</b></div>
    <div><span>${e(w.date)}</span><b>${e(day(a.order.created_at))}</b></div>
    <div><span>${e(w.due)}</span><b>${e(day(a.order.expected_at))}</b></div>
    <div><span>${e(w.qty)}</span><b>${e(piecesLabel(count, a.lang))}</b></div>
  </div>
  <table>
    <thead>${head}</thead>
    <tbody>${lines.map(row).join("")}</tbody>
    ${total}
  </table>
  ${orderNotes}
  <div class="sign">
    <div><span class="blank"></span>${e(w.supplierSign)}</div>
    <div><span class="blank"></span>${e(w.received)}</div>
    <div><span class="blank"></span>${e(w.date2)}</div>
  </div>
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { window.focus(); window.print(); }, 150);
    });
    window.addEventListener('afterprint', function () { window.close(); });
  </script>
</body>
</html>`;
}
