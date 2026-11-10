import { moneyFormat, type XCell, type XSheet } from "@/features/finance-reports/lib/workbook";
import { balanceWords, rangeText, type SupplierStatement } from "./supplier-statement";

/**
 * A supplier's statement as files: an Excel sheet (real numbers in the currency's own decimals,
 * negatives in parentheses, right to left for an Arabic reader) and an A4 page that prints
 * itself (saved as a PDF from the print window). Pure: the dialog downloads and opens them.
 */

type Lang = "ar" | "en";

const WORDS = {
  ar: {
    title: "كشف حساب المورد",
    store: "المتجر",
    supplier: "المورد",
    period: "الفترة",
    printed: "طُبع في",
    date: "التاريخ",
    entry: "البيان",
    detail: "التفاصيل",
    ordered: "طلبيات (عليك)",
    paid: "مدفوع (لك)",
    balance: "الرصيد",
    opening: "الرصيد السابق",
    totals: "مجموع الفترة",
    closing: "الرصيد في آخر الفترة",
    note: "الرصيد الموجب عليك للمورد، والسالب لك عنده. الطلبية بقيمتها اليوم ومن يوم إنشائها.",
    empty: "لا طلبيات ولا دفعات في هذه الفترة.",
  },
  en: {
    title: "Supplier statement",
    store: "Store",
    supplier: "Supplier",
    period: "Period",
    printed: "Printed",
    date: "Date",
    entry: "Entry",
    detail: "Details",
    ordered: "Orders (owed)",
    paid: "Paid",
    balance: "Balance",
    opening: "Balance before",
    totals: "Period totals",
    closing: "Balance at the end",
    note: "A positive balance is owed to the supplier; a negative one is your credit with them. An order counts from the day it was made, at its value today.",
    empty: "No orders or payments in this period.",
  },
} as const;

/** The statement as one Excel sheet. */
export function statementSheet(
  statement: SupplierStatement,
  options: { lang: Lang; store: string; digits: number },
): XSheet {
  const words = WORDS[options.lang];
  const money = moneyFormat(options.digits);
  const m = (value: number, extra: Partial<NonNullable<XCell>> = {}): XCell => ({
    value,
    format: money,
    ...extra,
  });
  const text = (value: string | null, extra: Partial<NonNullable<XCell>> = {}): XCell =>
    value ? { value, ...extra } : null;
  return {
    name: words.title,
    rtl: options.lang === "ar",
    widths: [12, 20, 46, 16, 16, 16],
    stickyRows: 6,
    rows: [
      [text(words.title, { bold: true })],
      [text(words.store), text(options.store)],
      [text(words.supplier), text(statement.supplier)],
      [text(words.period), text(rangeText(statement.range, options.lang))],
      [],
      [
        text(words.date, { heading: true }),
        text(words.entry, { heading: true }),
        text(words.detail, { heading: true }),
        text(words.ordered, { heading: true }),
        text(words.paid, { heading: true }),
        text(words.balance, { heading: true }),
      ],
      [
        null,
        text(words.opening, { bold: true }),
        null,
        null,
        null,
        m(statement.opening, { bold: true }),
      ],
      ...statement.lines.map((line): XCell[] => [
        { value: line.date, text: true },
        text(line.title, { text: true }),
        text(line.detail),
        line.ordered ? m(line.ordered) : null,
        line.paid ? m(line.paid) : null,
        m(line.balance),
      ]),
      [
        null,
        text(words.totals, { total: true }),
        { value: "", total: true },
        m(statement.ordered, { total: true }),
        m(statement.paid, { total: true }),
        m(statement.closing, { total: true }),
      ],
      [],
      [text(words.note)],
    ],
  };
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The printable page (A4). Every value is escaped; it prints itself when it opens. */
export function statementHtml(
  statement: SupplierStatement,
  options: { lang: Lang; store: string; money: (n: number) => string; today: string },
): string {
  const { lang, money } = options;
  const words = WORDS[lang];
  const e = escapeHtml;
  const isRTL = lang === "ar";
  const num = (value: number | null) => `<td class="num">${value ? e(money(value)) : ""}</td>`;
  const rows = statement.lines
    .map(
      (line) =>
        `<tr><td class="day">${e(line.date)}</td><td><b>${e(line.title)}</b>${line.detail ? `<div class="muted">${e(line.detail)}</div>` : ""}</td>${num(line.ordered)}${num(line.paid)}<td class="num">${e(money(line.balance))}</td></tr>`,
    )
    .join("");
  return `<!DOCTYPE html>
<html dir="${isRTL ? "rtl" : "ltr"}" lang="${lang}">
<head>
  <meta charset="utf-8" />
  <title>${e(words.title)} — ${e(statement.supplier)}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body { font-family: ${isRTL ? "'Tajawal','Cairo'," : ""}-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: black; margin: 0; padding: 16px; font-size: 12px; line-height: 1.45; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 2px solid black; padding-bottom: 10px; margin-bottom: 12px; }
    .big { font-size: 18px; font-weight: 800; }
    .muted { color: dimgray; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid silver; padding: 5px 7px; text-align: start; vertical-align: top; }
    th { background: whitesmoke; font-size: 11px; }
    tr { break-inside: avoid; }
    td.num { text-align: end; white-space: nowrap; font-variant-numeric: tabular-nums; }
    td.day { white-space: nowrap; font-variant-numeric: tabular-nums; }
    tr.strong td { font-weight: 700; background: whitesmoke; }
    .closing { margin-top: 14px; margin-inline-start: auto; width: 60%; border: 1.5px solid black; border-radius: 6px; padding: 8px 10px; display: flex; justify-content: space-between; gap: 12px; font-size: 14px; break-inside: avoid; }
    .note { margin-top: 10px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="big">${e(options.store)}</div>
      <div class="muted">${e(words.printed)}: ${e(options.today)}</div>
    </div>
    <div>
      <div class="big">${e(words.title)}</div>
      <div><b>${e(statement.supplier)}</b></div>
      <div class="muted">${e(words.period)}: ${e(rangeText(statement.range, lang))}</div>
    </div>
  </div>
  <table>
    <thead><tr><th>${e(words.date)}</th><th>${e(words.entry)}</th><th>${e(words.ordered)}</th><th>${e(words.paid)}</th><th>${e(words.balance)}</th></tr></thead>
    <tbody>
      <tr class="strong"><td></td><td>${e(words.opening)}</td><td></td><td></td><td class="num">${e(money(statement.opening))}</td></tr>
      ${rows || `<tr><td colspan="5" class="muted">${e(words.empty)}</td></tr>`}
      <tr class="strong"><td></td><td>${e(words.totals)}</td>${num(statement.ordered)}${num(statement.paid)}<td class="num">${e(money(statement.closing))}</td></tr>
    </tbody>
  </table>
  <div class="closing"><span>${e(words.closing)}</span><b>${e(balanceWords(statement.closing, money, lang))}</b></div>
  <p class="muted note">${e(words.note)}</p>
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`;
}
