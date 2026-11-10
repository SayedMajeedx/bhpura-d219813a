import { moneyFormat, type XCell, type XSheet } from "@/features/finance-reports/lib/workbook";
import { roundCost } from "./landed-cost";
import {
  PAYMENT_METHODS,
  isPayment,
  methodLabel,
  paymentCredit,
  type AccountPayment,
  type PaymentMethod,
} from "./supplier-account";
import { rangeText, type StatementRange } from "./supplier-statement";

/**
 * Every payment to the store's suppliers in one list: chosen by period, supplier and method,
 * each with the day it was paid, who it went to, how, its reference, the orders it paid and the
 * credit it still holds; with the period's totals by method and by supplier, and the same as an
 * Excel sheet. A payment taken back counts in no total and is shown only when asked. An
 * adjustment (a discount from the supplier, an amount written off) moved no money, so it is not
 * here: the supplier's statement lists it. Pure.
 */

type Lang = "ar" | "en";
/** "none" picks the payments recorded before the method was asked. */
export type MethodFilter = PaymentMethod | "none" | "all";

export type RegisterFilter = {
  range: StatementRange;
  vendorId: string | "all";
  method: MethodFilter;
  showTakenBack: boolean;
};

export type RegisterRow = {
  payment: AccountPayment;
  supplier: string;
  ordersPaid: string[];
  credit: number;
  takenBack: boolean;
};

export type RegisterTotals = {
  total: number;
  count: number;
  byMethod: Array<{ method: PaymentMethod | null; total: number; count: number }>;
  bySupplier: Array<{ vendorId: string; supplier: string; total: number; count: number }>;
};

const inRange = (day: string, range: StatementRange) =>
  (!range.from || day >= range.from) && (!range.to || day <= range.to);

/** The payments the filter picks, the latest first. */
export function registerRows(
  payments: readonly AccountPayment[],
  names: ReadonlyMap<string, string>,
  filter: RegisterFilter,
  unknownSupplier: string,
): RegisterRow[] {
  return payments
    .filter(isPayment)
    .filter((p) => inRange(p.paid_on, filter.range))
    .filter((p) => filter.vendorId === "all" || p.vendor_id === filter.vendorId)
    .filter(
      (p) =>
        filter.method === "all" ||
        (filter.method === "none" ? p.method === null : p.method === filter.method),
    )
    .filter((p) => filter.showTakenBack || !p.voided_at)
    .map((payment) => ({
      payment,
      supplier: names.get(payment.vendor_id) ?? unknownSupplier,
      ordersPaid: [
        ...new Set(payment.applied.filter((a) => !a.voided && a.po_number).map((a) => a.po_number)),
      ],
      credit: paymentCredit(payment),
      takenBack: Boolean(payment.voided_at),
    }))
    .sort(
      (a, b) =>
        b.payment.paid_on.localeCompare(a.payment.paid_on) ||
        b.payment.created_at.localeCompare(a.payment.created_at),
    );
}

/** What the rows paid, all told, by method and by supplier; payments taken back count nowhere. */
export function registerTotals(rows: readonly RegisterRow[]): RegisterTotals {
  const standing = rows.filter((r) => !r.takenBack);
  const methods = new Map<PaymentMethod | null, { total: number; count: number }>();
  const suppliers = new Map<string, { supplier: string; total: number; count: number }>();
  let total = 0;
  for (const row of standing) {
    const amount = row.payment.amount;
    total = roundCost(total + amount);
    const m = methods.get(row.payment.method) ?? { total: 0, count: 0 };
    methods.set(row.payment.method, { total: roundCost(m.total + amount), count: m.count + 1 });
    const s = suppliers.get(row.payment.vendor_id) ?? {
      supplier: row.supplier,
      total: 0,
      count: 0,
    };
    suppliers.set(row.payment.vendor_id, {
      supplier: s.supplier,
      total: roundCost(s.total + amount),
      count: s.count + 1,
    });
  }
  const order: Array<PaymentMethod | null> = [...PAYMENT_METHODS, null];
  return {
    total,
    count: standing.length,
    byMethod: order
      .filter((m) => methods.has(m))
      .map((method) => ({ method, ...methods.get(method)! })),
    bySupplier: [...suppliers.entries()]
      .map(([vendorId, s]) => ({ vendorId, ...s }))
      .sort((a, b) => b.total - a.total || a.supplier.localeCompare(b.supplier)),
  };
}

const WORDS = {
  ar: {
    title: "دفعات الموردين",
    store: "المتجر",
    period: "الفترة",
    date: "التاريخ",
    supplier: "المورد",
    method: "الطريقة",
    reference: "المرجع",
    orders: "الطلبيات المدفوعة",
    credit: "رصيد عند المورد",
    note: "ملاحظة",
    amount: "المبلغ",
    takenBack: "أُلغيت",
    total: "المجموع",
    byMethod: "حسب طريقة الدفع",
    bySupplier: "حسب المورد",
    count: "عدد الدفعات",
    rule: "الدفعة الملغية لا تدخل في أي مجموع. الدفع للمورد ليس مصروفاً: تكلفة البضاعة تُحسب حين تُباع القطعة.",
  },
  en: {
    title: "Supplier payments",
    store: "Store",
    period: "Period",
    date: "Date",
    supplier: "Supplier",
    method: "Method",
    reference: "Reference",
    orders: "Orders paid",
    credit: "Credit with the supplier",
    note: "Note",
    amount: "Amount",
    takenBack: "Taken back",
    total: "Total",
    byMethod: "By method",
    bySupplier: "By supplier",
    count: "Payments",
    rule: "A payment taken back counts in no total. Paying a supplier is not an expense: the cost of goods is counted when a piece sells.",
  },
} as const;

/** The register as one Excel sheet: the payments, then the totals by method and by supplier. */
export function registerSheet(
  rows: readonly RegisterRow[],
  options: { lang: Lang; store: string; range: StatementRange; digits: number },
): XSheet {
  const w = WORDS[options.lang];
  const format = moneyFormat(options.digits);
  const money = (value: number, extra: Partial<NonNullable<XCell>> = {}): XCell => ({
    value,
    format,
    ...extra,
  });
  const text = (
    value: string | null | undefined,
    extra: Partial<NonNullable<XCell>> = {},
  ): XCell => (value ? { value, ...extra } : null);
  const head = (value: string): XCell => ({ value, heading: true });
  const totals = registerTotals(rows);
  return {
    name: w.title,
    rtl: options.lang === "ar",
    widths: [12, 24, 16, 18, 26, 16, 30, 16],
    stickyRows: 5,
    rows: [
      [text(w.title, { bold: true })],
      [text(w.store), text(options.store)],
      [text(w.period), text(rangeText(options.range, options.lang))],
      [],
      [
        head(w.date),
        head(w.supplier),
        head(w.method),
        head(w.reference),
        head(w.orders),
        head(w.credit),
        head(w.note),
        head(w.amount),
      ],
      ...rows.map((row): XCell[] => [
        { value: row.payment.paid_on, text: true },
        text(row.supplier),
        text(methodLabel(row.payment.method, options.lang)),
        text(row.payment.reference, { text: true }),
        text(row.ordersPaid.join(", "), { text: true }),
        row.credit > 0 ? money(row.credit) : null,
        text(row.takenBack ? `${w.takenBack}: ${row.payment.void_reason ?? ""}` : row.payment.note),
        row.takenBack ? null : money(row.payment.amount),
      ]),
      [
        text(w.total, { total: true }),
        ...Array.from({ length: 6 }, (): XCell => ({ value: "", total: true })),
        money(totals.total, { total: true }),
      ],
      [],
      [head(w.byMethod), head(w.count), head(w.amount)],
      ...totals.byMethod.map((m): XCell[] => [
        text(methodLabel(m.method, options.lang)),
        { value: m.count },
        money(m.total),
      ]),
      [],
      [head(w.bySupplier), head(w.count), head(w.amount)],
      ...totals.bySupplier.map((s): XCell[] => [
        text(s.supplier),
        { value: s.count },
        money(s.total),
      ]),
      [],
      [text(w.rule)],
    ],
  };
}
