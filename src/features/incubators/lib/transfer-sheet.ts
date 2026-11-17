import { realSize } from "@/lib/default-variant";
import {
  COUNT_FORMAT,
  moneyFormat,
  type XCell,
  type XSheet,
} from "@/features/finance-reports/lib/workbook";
import { transferLabel } from "@/features/incubators/lib/move-pieces";

/**
 * A transfer's sheet: what a partner shop is handed with a batch (the owner's request of
 * 2026-11-17: the new partner needs an Excel of every batch with its prices and codes). Read
 * from the copy the database keeps of each line as it was sent (`incubator_transfer_items`), so
 * the sheet of an old batch says what was sent that day. An Excel file, an A4 delivery note with
 * two signatures, and a short WhatsApp message a person sends. Everything here is pure.
 */

type Lang = "ar" | "en";

export type TransferItemRow = {
  id: string;
  variant_id: string;
  quantity: number;
  external_code: string | null;
  price: number | null;
  commission_type: string | null;
  commission_value: number | null;
  previous_code: string | null;
  product_name: string | null;
  product_name_ar: string | null;
  product_name_en: string | null;
  size: string | null;
  color: string | null;
  sku: string | null;
  barcode: string | null;
};

export type TransferRow = {
  id: string;
  number: number;
  kind: "send" | "return" | "move";
  from_incubator_id: string | null;
  to_incubator_id: string | null;
  pieces: number;
  notes: string | null;
  created_at: string;
  incubator_transfer_items: TransferItemRow[] | null;
};

/** One line of the sheet, worked out once for the file, the page and the message. */
export type SheetLine = {
  code: string;
  sku: string;
  barcode: string;
  nameAr: string;
  nameEn: string;
  size: string;
  color: string;
  quantity: number;
  price: number;
  total: number;
  /** "15%" or "2.000 each"; empty when none. */
  commission: string;
  /** What the store is due for one piece once the partner's commission is taken. */
  duePerPiece: number;
};

const num = (value: unknown) => Number(value ?? 0) || 0;
const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;

export function sheetLines(
  transfer: TransferRow,
  money: (amount: number) => string,
  lang: Lang,
  digits = 3,
): SheetLine[] {
  return (transfer.incubator_transfer_items ?? []).map((item) => {
    const price = num(item.price);
    const value = num(item.commission_value);
    const fixed = item.commission_type === "fixed";
    const commissionPerPiece = fixed ? value : (price * value) / 100;
    return {
      code: item.external_code?.trim() || item.previous_code?.trim() || "",
      sku: item.sku?.trim() || "",
      barcode: item.barcode?.trim() || "",
      nameAr: item.product_name_ar?.trim() || item.product_name?.trim() || "",
      nameEn: item.product_name_en?.trim() || item.product_name?.trim() || "",
      size: realSize(item.size) ?? "",
      color: item.color?.trim() || "",
      quantity: num(item.quantity),
      price,
      total: round(price * num(item.quantity), digits),
      commission:
        value > 0
          ? fixed
            ? `${money(value)} ${lang === "ar" ? "للقطعة" : "each"}`
            : `${value}%`
          : "",
      duePerPiece: round(Math.max(0, price - commissionPerPiece), digits),
    };
  });
}

export function sheetTotals(lines: readonly SheetLine[]) {
  return {
    pieces: lines.reduce((sum, line) => sum + line.quantity, 0),
    value: lines.reduce((sum, line) => sum + line.total, 0),
    due: lines.reduce((sum, line) => sum + line.duePerPiece * line.quantity, 0),
  };
}

export type SheetContext = {
  lang: Lang;
  store: string;
  /** Where the pieces came from and where they went, by name ("the store" for the store). */
  from: string;
  to: string;
  /** The partner the sheet is for: who received the pieces, or who sent them back. */
  partner: string;
  /** The day it was made, as the reader writes a day. */
  date: string;
  money: (amount: number) => string;
  digits: number;
};

const WORDS = {
  ar: {
    title: "تحويل بضاعة",
    number: "رقم التحويل",
    date: "التاريخ",
    from: "من",
    to: "إلى",
    store: "المحل",
    row: "#",
    code: "كود المحل الشريك",
    sku: "رمز المنتج (SKU)",
    barcode: "الباركود",
    nameAr: "المنتج",
    nameEn: "Product",
    size: "المقاس",
    color: "اللون",
    qty: "الكمية",
    price: "سعر القطعة",
    total: "الإجمالي",
    commission: "العمولة",
    due: "المستحق لنا للقطعة",
    totals: "المجموع",
    pieces: "القطع",
    value: "القيمة",
    dueTotal: "المستحق لنا",
    notes: "ملاحظات",
    handed: "سلّم",
    received: "استلم",
    signature: "الاسم والتوقيع",
  },
  en: {
    title: "Stock transfer",
    number: "Transfer no.",
    date: "Date",
    from: "From",
    to: "To",
    store: "Store",
    row: "#",
    code: "Partner code",
    sku: "SKU",
    barcode: "Barcode",
    nameAr: "المنتج",
    nameEn: "Product",
    size: "Size",
    color: "Colour",
    qty: "Qty",
    price: "Unit price",
    total: "Total",
    commission: "Commission",
    due: "Due to us per piece",
    totals: "Totals",
    pieces: "Pieces",
    value: "Value",
    dueTotal: "Due to us",
    notes: "Notes",
    handed: "Handed over by",
    received: "Received by",
    signature: "Name and signature",
  },
};

/** The transfer as an Excel sheet: a heading block, one row per line, a total line. */
export function transferSheet(transfer: TransferRow, context: SheetContext): XSheet {
  const w = WORDS[context.lang];
  const money = moneyFormat(context.digits);
  const lines = sheetLines(transfer, context.money, context.lang, context.digits);
  const totals = sheetTotals(lines);
  const text = (value: string, extra: Partial<NonNullable<XCell>> = {}): XCell =>
    value ? { value, ...extra } : null;
  const amount = (value: number, extra: Partial<NonNullable<XCell>> = {}): XCell => ({
    value,
    format: money,
    ...extra,
  });
  const heading = [
    w.row,
    w.code,
    w.sku,
    w.barcode,
    w.nameAr,
    w.nameEn,
    w.size,
    w.color,
    w.qty,
    w.price,
    w.total,
    w.commission,
    w.due,
  ].map((label): XCell => ({ value: label, heading: true }));

  return {
    name: transferLabel(transfer.number),
    rtl: context.lang === "ar",
    stickyRows: 7,
    widths: [5, 16, 16, 16, 26, 26, 8, 12, 7, 12, 12, 12, 14],
    rows: [
      [{ value: `${context.store} · ${w.title}`, bold: true }],
      [text(w.number), { value: transferLabel(transfer.number), bold: true, text: true }],
      [text(w.date), text(context.date)],
      [text(w.from), text(context.from)],
      [text(w.to), text(context.to)],
      [text(w.notes), text(transfer.notes?.trim() ?? "")],
      heading,
      ...lines.map((line, index): XCell[] => [
        { value: index + 1, format: COUNT_FORMAT },
        text(line.code, { text: true }),
        text(line.sku, { text: true }),
        text(line.barcode, { text: true }),
        text(line.nameAr),
        text(line.nameEn),
        text(line.size, { text: true }),
        text(line.color),
        { value: line.quantity, format: COUNT_FORMAT },
        amount(line.price),
        amount(line.total),
        text(line.commission),
        amount(line.duePerPiece),
      ]),
      [
        { value: w.totals, total: true },
        ...Array.from({ length: 7 }, (): XCell => ({ value: "", total: true })),
        { value: totals.pieces, format: COUNT_FORMAT, total: true },
        { value: "", total: true },
        amount(totals.value, { total: true }),
        { value: "", total: true },
        amount(totals.due, { total: true }),
      ],
    ],
  };
}

/** "pura-TR-0007.xlsx". */
export function transferFileName(slug: string, number: number) {
  const store =
    slug
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-|-$/g, "") || "store";
  return `${store}-${transferLabel(number)}.xlsx`;
}

function escapeHtml(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** The A4 delivery note: who handed it over and who received it sign it; it prints itself. */
export function transferHtml(transfer: TransferRow, context: SheetContext): string {
  const w = WORDS[context.lang];
  const e = escapeHtml;
  const isRTL = context.lang === "ar";
  const lines = sheetLines(transfer, context.money, context.lang, context.digits);
  const totals = sheetTotals(lines);
  const name = (line: SheetLine) =>
    isRTL ? line.nameAr || line.nameEn : line.nameEn || line.nameAr;
  const options = (line: SheetLine) => [line.size, line.color].filter(Boolean).join(" / ");
  const rows = lines
    .map(
      (line, index) =>
        `<tr><td class="num">${index + 1}</td><td>${e(line.code || "—")}</td><td>${e(line.sku || "—")}</td><td>${e(name(line))}${options(line) ? `<div class="muted">${e(options(line))}</div>` : ""}</td><td class="num">${line.quantity}</td><td class="num">${e(context.money(line.price))}</td><td class="num">${e(context.money(line.total))}</td></tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html dir="${isRTL ? "rtl" : "ltr"}" lang="${context.lang}">
<head>
  <meta charset="utf-8" />
  <title>${e(w.title)} ${e(transferLabel(transfer.number))}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body { font-family: ${isRTL ? "'Tajawal','Cairo'," : ""}-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: black; margin: 0; padding: 16px; font-size: 12px; line-height: 1.45; }
    .header { display: flex; justify-content: space-between; gap: 16px; border-bottom: 2px solid black; padding-bottom: 10px; margin-bottom: 12px; }
    .brand, .doc { font-size: 18px; font-weight: 800; }
    .muted { color: dimgray; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid silver; padding: 5px 7px; text-align: start; vertical-align: top; }
    th { background: whitesmoke; font-size: 11px; }
    td.num { text-align: end; white-space: nowrap; font-variant-numeric: tabular-nums; }
    tr { break-inside: avoid; }
    .totals { margin-top: 14px; margin-inline-start: auto; width: 50%; break-inside: avoid; }
    .total { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid gainsboro; }
    .signs { display: flex; gap: 32px; margin-top: 48px; break-inside: avoid; }
    .sign { flex: 1; border-top: 1px solid black; padding-top: 6px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">${e(context.store)}</div>
      <div class="muted">${e(w.from)}: ${e(context.from)} · ${e(w.to)}: ${e(context.to)}</div>
    </div>
    <div>
      <div class="doc">${e(w.title)}</div>
      <div><b>${e(transferLabel(transfer.number))}</b></div>
      <div class="muted">${e(w.date)}: ${e(context.date)}</div>
    </div>
  </div>
  <table>
    <thead><tr><th>${e(w.row)}</th><th>${e(w.code)}</th><th>${e(w.sku)}</th><th>${e(isRTL ? w.nameAr : w.nameEn)}</th><th>${e(w.qty)}</th><th>${e(w.price)}</th><th>${e(w.total)}</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <div class="total"><span>${e(w.pieces)}</span><b>${totals.pieces}</b></div>
    <div class="total"><span>${e(w.value)}</span><b>${e(context.money(totals.value))}</b></div>
  </div>
  ${transfer.notes?.trim() ? `<p class="muted">${e(w.notes)}: ${e(transfer.notes.trim())}</p>` : ""}
  <div class="signs">
    <div class="sign">${e(w.handed)}<div class="muted">${e(w.signature)}</div></div>
    <div class="sign">${e(w.received)}<div class="muted">${e(w.signature)}</div></div>
  </div>
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`;
}

/** The short message a person sends with the file: the batch, its pieces and its value. */
export function transferMessage(transfer: TransferRow, context: SheetContext): string {
  const lines = sheetLines(transfer, context.money, context.lang, context.digits);
  const totals = sheetTotals(lines);
  const label = transferLabel(transfer.number);
  return context.lang === "ar"
    ? [
        `مرحباً ${context.partner}، هذا تحويل بضاعة من ${context.store}.`,
        `رقم التحويل: ${label} · ${context.date}`,
        `عدد القطع: ${totals.pieces}`,
        `القيمة: ${context.money(totals.value)}`,
        "مرفق ملف التفاصيل.",
      ].join("\n")
    : [
        `Hello ${context.partner}, here is a stock transfer from ${context.store}.`,
        `Transfer ${label} · ${context.date}`,
        `Pieces: ${totals.pieces}`,
        `Value: ${context.money(totals.value)}`,
        "The details file is attached.",
      ].join("\n");
}
