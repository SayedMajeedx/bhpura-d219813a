import {
  categoryMargins,
  marginsSheet,
  productMargins,
  type MarginRow,
} from "@/features/finance-reports/lib/margins";
import {
  balancesSheet,
  customerBalances,
  type OpenOrder,
  type PartnerBalance,
} from "@/features/finance-reports/lib/receivables";
import type { XCell, XSheet } from "@/features/finance-reports/lib/workbook";
import { methodLabel, type PaymentMethod } from "@/features/supplier-orders/lib/supplier-account";
import { paymentMethodWords, type Words } from "@/lib/report-words";
import {
  countCell,
  dayCell,
  inCurrency,
  moneyCell,
  num,
  periodText,
  tableSheet,
  text,
  type ExportContext,
  type Rows,
} from "./export-shared";

/**
 * The owner's report beyond sales: each partner shop's figures, profit by product and by
 * category (the Margins page's own sheets), the period's expenses, and, as they stand today,
 * what customers and partner shops owe, what is owed to suppliers and the stock at cost.
 */

const TOTAL: Words = { en: "Total", ar: "المجموع" };
const today = (ctx: ExportContext, day: string): Words => ({
  en: `As they stand on ${day}, not at the period's end`,
  ar: `كما هي يوم ${day}، لا في نهاية الفترة`,
});

export type PartnerLine = {
  partner: string;
  sales: number;
  pieces: number;
  commission: number;
  due: number;
  paid: number;
  cost: number;
};

/** Each partner shop's sales of the period, added up, the shop that sold most first. */
export function partnerLines(sales: Rows, currency: string): PartnerLine[] {
  const by = new Map<string, PartnerLine>();
  for (const r of inCurrency(sales, currency)) {
    const partner = text(r.partner) ?? "—";
    const line = by.get(partner) ?? {
      partner,
      sales: 0,
      pieces: 0,
      commission: 0,
      due: 0,
      paid: 0,
      cost: 0,
    };
    line.sales += num(r.gross);
    line.pieces += num(r.quantity);
    line.commission += num(r.commission);
    line.due += num(r.net_due);
    line.paid += num(r.paid);
    line.cost += num(r.cost);
    by.set(partner, line);
  }
  return [...by.values()].sort((a, b) => b.sales - a.sales);
}

export function partnersSheet(ctx: ExportContext, sales: Rows, payments: Rows): XSheet {
  const m = (v: number) => moneyCell(ctx, v);
  const table = tableSheet({
    ctx,
    name: { en: "Partner shops", ar: "المحلات الشريكة" },
    note: {
      en: "Each shop's sales of the period; every sale is listed on the Sales sheet",
      ar: "مبيعات كل محل في الفترة؛ وكل عملية بيع في ورقة المبيعات",
    },
    columns: [
      { head: { en: "Partner shop", ar: "المحل" }, width: 24 },
      { head: { en: "Pieces", ar: "القطع" }, width: 9, sum: true, count: true },
      { head: { en: "Sales", ar: "المبيعات" }, width: 13, sum: true },
      { head: { en: "Commission", ar: "العمولة" }, width: 12, sum: true },
      { head: { en: "Due to the store", ar: "المستحق للمتجر" }, width: 14, sum: true },
      { head: { en: "Paid", ar: "المدفوع" }, width: 12, sum: true },
      { head: { en: "Still owed", ar: "المتبقي" }, width: 12, sum: true },
      { head: { en: "Cost of goods", ar: "تكلفة البضاعة" }, width: 13, sum: true },
      { head: { en: "Gross profit", ar: "مجمل الربح" }, width: 13, sum: true },
    ],
    rows: partnerLines(sales, ctx.currency).map((l) => [
      { value: l.partner },
      countCell(l.pieces),
      m(l.sales),
      m(-l.commission),
      m(l.due),
      m(l.paid),
      m(Math.max(0, l.due - l.paid)),
      m(-l.cost),
      m(l.sales - l.commission - l.cost),
    ]),
    totalLabel: TOTAL,
  });
  const paid = inCurrency(payments, ctx.currency);
  if (!paid.length) return table.sheet;
  const w = (words: Words) => words[ctx.lang];
  const head = (words: Words): XCell => ({ value: w(words), heading: true });
  return {
    ...table.sheet,
    rows: [
      ...table.sheet.rows,
      [],
      [{ value: w({ en: "Payments from partner shops", ar: "دفعات المحلات" }), bold: true }],
      [
        head({ en: "Date", ar: "التاريخ" }),
        head({ en: "Partner shop", ar: "المحل" }),
        head({ en: "Amount", ar: "المبلغ" }),
        head({ en: "Method", ar: "الطريقة" }),
        head({ en: "Reference", ar: "المرجع" }),
      ],
      ...paid.map((r): XCell[] => [
        dayCell(r.payment_date),
        { value: text(r.partner) },
        moneyCell(ctx, r.amount),
        { value: r.method ? paymentMethodWords(r.method, ctx.lang) : null },
        { value: text(r.reference), text: true },
      ]),
      [
        { value: w(TOTAL), total: true },
        null,
        {
          ...moneyCell(
            ctx,
            paid.reduce((s, r) => s + num(r.amount), 0),
          )!,
          total: true,
        },
      ],
    ],
  };
}

export function marginSheets(ctx: ExportContext, margins: MarginRow[]): XSheet[] {
  if (!margins.length) return [];
  const subtitle = `${ctx.storeName} · ${periodText(ctx)} · ${ctx.currency}`;
  const common = { currency: ctx.currency, digits: ctx.digits, lang: ctx.lang, subtitle };
  return [
    marginsSheet({
      ...common,
      lines: productMargins(margins, ctx.currency, ctx.lang).sort(
        (a, b) => b.grossProfit - a.grossProfit,
      ),
      by: "product",
      title: ctx.lang === "ar" ? "الربح حسب المنتج" : "Profit by product",
    }),
    marginsSheet({
      ...common,
      lines: categoryMargins(margins, ctx.currency, ctx.lang).sort(
        (a, b) => b.grossProfit - a.grossProfit,
      ),
      by: "category",
      title: ctx.lang === "ar" ? "الربح حسب الفئة" : "Profit by category",
    }),
  ];
}

export function expensesSheet(ctx: ExportContext, expenses: Rows): XSheet | null {
  const mine = inCurrency(expenses, ctx.currency);
  if (!mine.length) return null;
  const uncategorised = ctx.lang === "ar" ? "بلا فئة" : "Uncategorised";
  const byCategory = new Map<string, { amount: number; tax: number; count: number }>();
  for (const e of mine) {
    const key = text(e.category) ?? uncategorised;
    const sum = byCategory.get(key) ?? { amount: 0, tax: 0, count: 0 };
    sum.amount += num(e.amount);
    sum.tax += num(e.tax);
    sum.count += 1;
    byCategory.set(key, sum);
  }
  const yes = ctx.lang === "ar" ? "نعم" : "Yes";
  const no = ctx.lang === "ar" ? "لا" : "No";
  const summary = tableSheet({
    ctx,
    name: { en: "Expenses", ar: "المصاريف" },
    note: { en: "By each expense's own date", ar: "بتاريخ كل مصروف" },
    columns: [
      { head: { en: "Category", ar: "الفئة" }, width: 26 },
      { head: { en: "Expenses", ar: "العدد" }, width: 9, sum: true, count: true },
      { head: { en: "Amount", ar: "المبلغ" }, width: 14, sum: true },
      { head: { en: "VAT paid", ar: "الضريبة المدفوعة" }, width: 14, sum: true },
    ],
    rows: [...byCategory.entries()]
      .sort((a, b) => b[1].amount - a[1].amount)
      .map(([key, v]) => [
        { value: key },
        countCell(v.count),
        moneyCell(ctx, v.amount),
        moneyCell(ctx, v.tax),
      ]),
    totalLabel: TOTAL,
  }).sheet;
  const w = (words: Words) => words[ctx.lang];
  const head = (words: Words): XCell => ({ value: w(words), heading: true });
  return {
    ...summary,
    widths: [26, 12, 14, 34, 22, 14, 14],
    rows: [
      ...summary.rows,
      [],
      [
        head({ en: "Date", ar: "التاريخ" }),
        head({ en: "Category", ar: "الفئة" }),
        head({ en: "Amount", ar: "المبلغ" }),
        head({ en: "Description", ar: "الوصف" }),
        head({ en: "Supplier", ar: "المورد" }),
        head({ en: "VAT paid", ar: "الضريبة" }),
        head({ en: "Running cost", ar: "مصروف تشغيلي" }),
      ],
      ...mine.map((e): XCell[] => [
        dayCell(e.expense_date),
        { value: text(e.category) ?? uncategorised },
        moneyCell(ctx, e.amount),
        { value: text(e.description) },
        { value: text(e.supplier) },
        moneyCell(ctx, e.tax),
        { value: e.running_cost ? yes : no },
      ]),
    ],
  };
}

export function balancesNowSheet(
  ctx: ExportContext,
  day: string,
  receivables: { orders: OpenOrder[]; partners: PartnerBalance[] },
): XSheet {
  return balancesSheet({
    customers: customerBalances(
      receivables.orders,
      ctx.currency,
      day,
      ctx.lang === "ar" ? "عميل بلا اسم" : "Unnamed customer",
    ),
    partners: receivables.partners,
    currency: ctx.currency,
    digits: ctx.digits,
    lang: ctx.lang,
    title: ctx.lang === "ar" ? "الأرصدة اليوم" : "Balances today",
    subtitle: `${ctx.storeName} · ${today(ctx, day)[ctx.lang]} · ${ctx.currency}`,
  });
}

export function stockSheet(ctx: ExportContext, day: string, stock: Rows): XSheet | null {
  if (!stock.length) return null;
  return tableSheet({
    ctx,
    name: { en: "Stock at cost", ar: "المخزون بالتكلفة" },
    note: today(ctx, day),
    columns: [
      { head: { en: "Product", ar: "المنتج" }, width: 34 },
      { head: { en: "Pieces", ar: "القطع" }, width: 10, sum: true, count: true },
      { head: { en: "Value at cost", ar: "القيمة بالتكلفة" }, width: 16, sum: true },
      {
        head: { en: "Pieces with no cost", ar: "قطع بلا تكلفة" },
        width: 16,
        sum: true,
        count: true,
      },
    ],
    rows: stock.map((r) => [
      { value: text(r.product) },
      countCell(r.units),
      moneyCell(ctx, r.value),
      countCell(r.units_without_cost),
    ]),
    totalLabel: TOTAL,
  }).sheet;
}

export function suppliersSheet(
  ctx: ExportContext,
  day: string,
  payments: Rows,
  owed: Rows,
): XSheet | null {
  if (!payments.length && !owed.length) return null;
  const table = tableSheet({
    ctx,
    name: { en: "Suppliers", ar: "الموردون" },
    note: {
      en: "Paid to suppliers in the period (not an expense: a piece's cost counts when it sells)",
      ar: "المدفوع للموردين في الفترة (ليس مصروفاً: تُحسب تكلفة القطعة عند بيعها)",
    },
    columns: [
      { head: { en: "Date", ar: "التاريخ" }, width: 12 },
      { head: { en: "Supplier", ar: "المورد" }, width: 24 },
      { head: { en: "Orders paid", ar: "الطلبيات المدفوعة" }, width: 20 },
      { head: { en: "Paid", ar: "المدفوع" }, width: 14, sum: true },
      { head: { en: "Method", ar: "الطريقة" }, width: 16 },
      { head: { en: "Reference", ar: "المرجع" }, width: 18 },
    ],
    rows: payments.map((r) => [
      dayCell(r.paid_on),
      { value: text(r.supplier) },
      {
        value:
          text(r.po_number) ?? (ctx.lang === "ar" ? "رصيد عند المورد" : "Credit with the supplier"),
        text: true,
      },
      moneyCell(ctx, r.amount),
      { value: methodLabel((text(r.method) as PaymentMethod | null) ?? null, ctx.lang) },
      { value: text(r.reference), text: true },
    ]),
    totalLabel: TOTAL,
  });
  if (!owed.length) return table.sheet;
  const w = (words: Words) => words[ctx.lang];
  return {
    ...table.sheet,
    rows: [
      ...table.sheet.rows,
      [],
      [
        { value: w(today(ctx, day)), heading: true },
        { value: w({ en: "Owed to the supplier", ar: "المستحق للمورد" }), heading: true },
      ],
      ...owed.map((r): XCell[] => [{ value: text(r.supplier) }, moneyCell(ctx, r.owed)]),
      [
        { value: w(TOTAL), total: true },
        {
          ...moneyCell(
            ctx,
            owed.reduce((s, r) => s + num(r.owed), 0),
          )!,
          total: true,
        },
      ],
    ],
  };
}
