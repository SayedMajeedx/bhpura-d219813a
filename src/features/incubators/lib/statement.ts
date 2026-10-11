import { incubatorAmountDue } from "@/features/incubators/lib/amount-due";
import { pieceName } from "@/features/incubators/lib/partner-stock";
import type { Incubator, Payment, Sale } from "@/features/incubators/types";

/**
 * A partner's statement of account: what it sold in a period, the store's share of it, what
 * it paid, and what it owes today. It is what the store sends a partner at settlement, as a
 * printed page or a WhatsApp message a person sends. Everything here is pure.
 */

type Lang = "ar" | "en";

/** Days are `YYYY-MM-DD`, inclusive; a missing end means "no limit on that side". */
export type StatementPeriod = { from: string | null; to: string | null };
export type StatementPreset = "this_month" | "last_month" | "all";

const pad = (value: number) => String(value).padStart(2, "0");
const day = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const fils = (value: number) => Math.round(value * 1000) / 1000;

/** The day a sale was made, on the calendar of whoever is reading. */
export function localDay(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : day(date);
}

export function statementPeriod(preset: StatementPreset, now: Date = new Date()): StatementPeriod {
  if (preset === "all") return { from: null, to: null };
  const shift = preset === "last_month" ? -1 : 0;
  const first = new Date(now.getFullYear(), now.getMonth() + shift, 1);
  const last = new Date(now.getFullYear(), now.getMonth() + shift + 1, 0);
  return { from: day(first), to: day(last) };
}

const within = (date: string, period: StatementPeriod) =>
  Boolean(date) && (!period.from || date >= period.from) && (!period.to || date <= period.to);

export type StatementSale = {
  id: string;
  date: string;
  piece: string;
  quantity: number;
  unitPrice: number;
  gross: number;
  commission: number;
  net: number;
};
export type StatementPayment = {
  id: string;
  date: string;
  method: string | null;
  reference: string | null;
  amount: number;
};
export type Statement = {
  partner: string;
  currency: string;
  period: StatementPeriod;
  sales: StatementSale[];
  payments: StatementPayment[];
  /** Totals of the period. */
  soldUnits: number;
  gross: number;
  commission: number;
  net: number;
  paid: number;
  /** What the partner owes today, whatever the period. */
  balanceDue: number;
};

/**
 * Reversed sales and voided payments are left out: they were undone. `balanceDue` is what the
 * database says the partner owes today; without it, the loaded sales are added up.
 */
export function buildStatement(input: {
  incubator: Pick<Incubator, "name" | "currency">;
  sales: readonly Sale[];
  payments: readonly Payment[];
  period: StatementPeriod;
  lang: Lang;
  balanceDue?: number;
}): Statement {
  const sales = input.sales
    .filter((sale) => sale.status === "confirmed" && within(localDay(sale.sold_at), input.period))
    .map((sale) => ({
      id: sale.id,
      date: localDay(sale.sold_at),
      piece: pieceName(sale.product_variants, input.lang),
      quantity: Number(sale.quantity),
      unitPrice: Number(sale.unit_price),
      gross: Number(sale.gross_amount),
      commission: Number(sale.commission_amount),
      net: Number(sale.net_due),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const payments = input.payments
    .filter(
      (payment) =>
        !payment.voided_at && within(String(payment.payment_date).slice(0, 10), input.period),
    )
    .map((payment) => ({
      id: payment.id,
      date: String(payment.payment_date).slice(0, 10),
      method: payment.payment_method,
      reference: payment.reference,
      amount: Number(payment.amount),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const total = <T>(rows: T[], of: (row: T) => number) =>
    fils(rows.reduce((sum, row) => sum + of(row), 0));
  return {
    partner: input.incubator.name,
    currency: input.incubator.currency,
    period: input.period,
    sales,
    payments,
    soldUnits: sales.reduce((sum, sale) => sum + sale.quantity, 0),
    gross: total(sales, (sale) => sale.gross),
    commission: total(sales, (sale) => sale.commission),
    net: total(sales, (sale) => sale.net),
    paid: total(payments, (payment) => payment.amount),
    balanceDue: input.balanceDue ?? incubatorAmountDue(input.sales),
  };
}

const WORDS = {
  en: {
    title: "Statement of account",
    period: "Period",
    allTime: "All sales to date",
    to: "to",
    sales: "Sales",
    payments: "Payments received",
    date: "Date",
    piece: "Piece",
    qty: "Qty",
    price: "Unit price",
    gross: "Sales",
    commission: "Commission",
    net: "Due to us",
    method: "Method",
    reference: "Reference",
    amount: "Amount",
    noSales: "No sales in this period.",
    noPayments: "No payments in this period.",
    totals: "Totals of the period",
    units: "Pieces sold",
    paid: "Paid in the period",
    balance: "Balance due today",
    printed: "Printed",
  },
  ar: {
    title: "كشف حساب",
    period: "الفترة",
    allTime: "كل المبيعات حتى اليوم",
    to: "إلى",
    sales: "المبيعات",
    payments: "الدفعات المستلمة",
    date: "التاريخ",
    piece: "القطعة",
    qty: "الكمية",
    price: "سعر القطعة",
    gross: "المبيعات",
    commission: "العمولة",
    net: "المستحق لنا",
    method: "الطريقة",
    reference: "المرجع",
    amount: "المبلغ",
    noSales: "لا توجد مبيعات في هذه الفترة.",
    noPayments: "لا توجد دفعات في هذه الفترة.",
    totals: "إجمالي الفترة",
    units: "القطع المباعة",
    paid: "المدفوع في الفترة",
    balance: "المبلغ المستحق اليوم",
    printed: "تاريخ الطباعة",
  },
} as const;

export function periodText(period: StatementPeriod, lang: Lang): string {
  const words = WORDS[lang];
  if (!period.from && !period.to) return words.allTime;
  return [period.from ?? "…", words.to, period.to ?? "…"].join(" ");
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type Money = (amount: number) => string;

/** The printable page (A4). Every value is escaped; it prints itself when it opens. */
export function statementHtml(
  statement: Statement,
  options: { lang: Lang; brand: string; money: Money; today: string },
): string {
  const { lang, money } = options;
  const words = WORDS[lang];
  const e = escapeHtml;
  const isRTL = lang === "ar";
  const cell = (value: string, cls = "") => `<td${cls ? ` class="${cls}"` : ""}>${e(value)}</td>`;
  const head = (labels: string[]) =>
    `<tr>${labels.map((label) => `<th>${e(label)}</th>`).join("")}</tr>`;

  const sales = statement.sales.length
    ? `<table><thead>${head([words.date, words.piece, words.qty, words.price, words.gross, words.commission, words.net])}</thead><tbody>${statement.sales
        .map(
          (sale) =>
            `<tr>${cell(sale.date)}${cell(sale.piece)}${cell(String(sale.quantity), "num")}${cell(money(sale.unitPrice), "num")}${cell(money(sale.gross), "num")}${cell(money(sale.commission), "num")}${cell(money(sale.net), "num")}</tr>`,
        )
        .join("")}</tbody></table>`
    : `<p class="empty">${e(words.noSales)}</p>`;
  const payments = statement.payments.length
    ? `<table><thead>${head([words.date, words.method, words.reference, words.amount])}</thead><tbody>${statement.payments
        .map(
          (payment) =>
            `<tr>${cell(payment.date)}${cell(payment.method ?? "—")}${cell(payment.reference ?? "—")}${cell(money(payment.amount), "num")}</tr>`,
        )
        .join("")}</tbody></table>`
    : `<p class="empty">${e(words.noPayments)}</p>`;
  const total = (label: string, value: string, strong = false) =>
    `<div class="${strong ? "total strong" : "total"}"><span>${e(label)}</span><b>${e(value)}</b></div>`;

  return `<!DOCTYPE html>
<html dir="${isRTL ? "rtl" : "ltr"}" lang="${lang}">
<head>
  <meta charset="utf-8" />
  <title>${e(words.title)} — ${e(statement.partner)}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body { font-family: ${isRTL ? "'Tajawal','Cairo'," : ""}-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: black; margin: 0; padding: 16px; font-size: 12px; line-height: 1.45; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 2px solid black; padding-bottom: 10px; margin-bottom: 12px; }
    .brand { font-size: 18px; font-weight: 800; }
    .doc { font-size: 18px; font-weight: 800; }
    .muted { color: dimgray; font-size: 11px; }
    h2 { font-size: 13px; margin: 16px 0 6px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid silver; padding: 5px 7px; text-align: start; vertical-align: top; }
    th { background: whitesmoke; font-size: 11px; }
    td.num { text-align: end; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .empty { color: dimgray; margin: 4px 0; }
    .totals { margin-top: 16px; margin-inline-start: auto; width: 60%; break-inside: avoid; }
    .total { display: flex; justify-content: space-between; gap: 12px; padding: 4px 0; border-bottom: 1px solid gainsboro; }
    .total.strong { border: 1.5px solid black; border-radius: 6px; padding: 8px 10px; margin-top: 8px; font-size: 14px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">${e(options.brand)}</div>
      <div class="muted">${e(words.printed)}: ${e(options.today)}</div>
    </div>
    <div>
      <div class="doc">${e(words.title)}</div>
      <div><b>${e(statement.partner)}</b></div>
      <div class="muted">${e(words.period)}: ${e(periodText(statement.period, lang))}</div>
    </div>
  </div>
  <h2>${e(words.sales)}</h2>
  ${sales}
  <h2>${e(words.payments)}</h2>
  ${payments}
  <div class="totals">
    <div class="muted">${e(words.totals)}</div>
    ${total(words.units, String(statement.soldUnits))}
    ${total(words.gross, money(statement.gross))}
    ${total(words.commission, money(statement.commission))}
    ${total(words.net, money(statement.net))}
    ${total(words.paid, money(statement.paid))}
    ${total(words.balance, money(statement.balanceDue), true)}
  </div>
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`;
}

/** The short version a person sends on WhatsApp. */
export function statementMessage(
  statement: Statement,
  options: { lang: Lang; brand: string; money: Money },
): string {
  const { lang, money } = options;
  const words = WORDS[lang];
  const greeting =
    lang === "ar"
      ? `مرحباً ${statement.partner}، هذا كشف حسابكم من ${options.brand}.`
      : `Hello ${statement.partner}, here is your statement from ${options.brand}.`;
  return [
    greeting,
    `${words.period}: ${periodText(statement.period, lang)}`,
    `${words.units}: ${statement.soldUnits}`,
    `${words.gross}: ${money(statement.gross)}`,
    `${words.commission}: ${money(statement.commission)}`,
    `${words.net}: ${money(statement.net)}`,
    `${words.paid}: ${money(statement.paid)}`,
    `${words.balance}: ${money(statement.balanceDue)}`,
  ].join("\n");
}
