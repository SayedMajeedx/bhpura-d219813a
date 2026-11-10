import { roundCost } from "./landed-cost";
import { paymentOf, type SupplierOrder } from "./order-state";
import { methodLabel, type AccountPayment, type PaymentMethod } from "./supplier-account";

/**
 * A supplier's statement of account: what was ordered from them and what was paid to them, in
 * a period, one line each by day, with the balance after each line, opening with the balance
 * before the period. A positive balance is what the store owes the supplier; a negative one is
 * the store's credit with them. An order counts from the day it was made, at its value today (a
 * draft and a cancelled order count for nothing); a payment counts on the day it was paid, and
 * one taken back counts nowhere. Pure: the dialog draws it, the files and the message read it.
 */

type Lang = "ar" | "en";

/** Days are `YYYY-MM-DD`, inclusive; a missing end means no limit on that side. */
export type StatementRange = { from: string | null; to: string | null };
export type StatementPreset = "this_month" | "last_month" | "last_3_months" | "this_year" | "all";
export const STATEMENT_PRESETS: readonly StatementPreset[] = [
  "this_month",
  "last_month",
  "last_3_months",
  "this_year",
  "all",
];

const pad = (n: number) => String(n).padStart(2, "0");
const dayOf = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** The day a moment falls on, on the reader's own calendar. */
export function localDayOf(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : dayOf(date);
}

export function statementRange(preset: StatementPreset, now: Date = new Date()): StatementRange {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case "this_month":
      return { from: dayOf(new Date(y, m, 1)), to: dayOf(new Date(y, m + 1, 0)) };
    case "last_month":
      return { from: dayOf(new Date(y, m - 1, 1)), to: dayOf(new Date(y, m, 0)) };
    case "last_3_months":
      return { from: dayOf(new Date(y, m - 2, 1)), to: dayOf(new Date(y, m + 1, 0)) };
    case "this_year":
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    case "all":
      return { from: null, to: null };
  }
}

const WORDS = {
  ar: {
    presets: {
      this_month: "هذا الشهر",
      last_month: "الشهر الماضي",
      last_3_months: "آخر 3 أشهر",
      this_year: "هذه السنة",
      all: "كل الفترات",
    },
    to: "إلى",
    allTime: "كل الفترات",
    order: (n: string) => `طلبية ${n}`,
    payment: "دفعة",
    paid: (orders: string[]) => `دفعت ${orders.join("، ")}`,
    credit: "رصيد عند المورد",
  },
  en: {
    presets: {
      this_month: "This month",
      last_month: "Last month",
      last_3_months: "Last 3 months",
      this_year: "This year",
      all: "All time",
    },
    to: "to",
    allTime: "All time",
    order: (n: string) => `Order ${n}`,
    payment: "Payment",
    paid: (orders: string[]) => `Paid ${orders.join(", ")}`,
    credit: "Credit with the supplier",
  },
} as const;

export function presetLabel(preset: StatementPreset, lang: Lang): string {
  return WORDS[lang].presets[preset];
}

export function rangeText(range: StatementRange, lang: Lang): string {
  if (!range.from && !range.to) return WORDS[lang].allTime;
  return [range.from ?? "…", WORDS[lang].to, range.to ?? "…"].join(" ");
}

export type StatementLine = {
  date: string;
  kind: "order" | "payment";
  /** "Order PO-0003" or "Payment". */
  title: string;
  /** A payment's method, the orders it paid, its reference and note. */
  detail: string;
  method: PaymentMethod | null;
  reference: string | null;
  /** What the line adds to what is owed (an order) and takes off it (a payment). */
  ordered: number;
  paid: number;
  balance: number;
};

export type SupplierStatement = {
  supplier: string;
  range: StatementRange;
  opening: number;
  lines: StatementLine[];
  ordered: number;
  paid: number;
  closing: number;
};

const within = (date: string, range: StatementRange) =>
  (!range.from || date >= range.from) && (!range.to || date <= range.to);
const before = (date: string, range: StatementRange) => Boolean(range.from) && date < range.from!;

/** The statement of one supplier for a period. */
export function buildSupplierStatement(input: {
  supplier: { id: string; name: string };
  orders: readonly SupplierOrder[];
  payments: readonly AccountPayment[];
  range: StatementRange;
  lang: Lang;
}): SupplierStatement {
  const { supplier, range, lang } = input;
  const words = WORDS[lang];
  type Entry = Omit<StatementLine, "balance"> & { at: string; order: number };
  const entries: Entry[] = [];

  for (const order of input.orders) {
    if (order.vendor_id !== supplier.id) continue;
    if (order.status === "draft" || order.status === "cancelled") continue;
    const total = paymentOf(order).total;
    if (total <= 0) continue;
    entries.push({
      date: localDayOf(order.created_at),
      at: order.created_at,
      order: 0,
      kind: "order",
      title: words.order(order.po_number),
      detail: "",
      method: null,
      reference: null,
      ordered: total,
      paid: 0,
    });
  }
  for (const payment of input.payments) {
    if (payment.vendor_id !== supplier.id || payment.voided_at) continue;
    const orders = [
      ...new Set(payment.applied.filter((a) => !a.voided && a.po_number).map((a) => a.po_number)),
    ];
    const detail = [
      methodLabel(payment.method, lang),
      orders.length ? words.paid(orders) : words.credit,
      payment.reference,
      payment.note,
    ]
      .filter(Boolean)
      .join(" · ");
    entries.push({
      date: payment.paid_on,
      at: payment.created_at,
      order: 1,
      kind: "payment",
      title: words.payment,
      detail,
      method: payment.method,
      reference: payment.reference,
      ordered: 0,
      paid: payment.amount,
    });
  }

  entries.sort(
    (a, b) => a.date.localeCompare(b.date) || a.order - b.order || a.at.localeCompare(b.at),
  );
  let opening = 0;
  for (const entry of entries) {
    if (before(entry.date, range)) opening = roundCost(opening + entry.ordered - entry.paid);
  }
  let balance = opening;
  let ordered = 0;
  let paid = 0;
  const lines: StatementLine[] = [];
  for (const entry of entries) {
    if (!within(entry.date, range)) continue;
    balance = roundCost(balance + entry.ordered - entry.paid);
    ordered = roundCost(ordered + entry.ordered);
    paid = roundCost(paid + entry.paid);
    const { at: _at, order: _order, ...line } = entry;
    lines.push({ ...line, balance });
  }
  return { supplier: supplier.name, range, opening, lines, ordered, paid, closing: balance };
}

/** A balance in words: what the store owes, or its credit with the supplier. */
export function balanceWords(balance: number, money: (n: number) => string, lang: Lang): string {
  if (balance > 0) return lang === "ar" ? `عليك ${money(balance)}` : `You owe ${money(balance)}`;
  if (balance < 0) {
    return lang === "ar" ? `لك عند المورد ${money(-balance)}` : `Your credit ${money(-balance)}`;
  }
  return lang === "ar" ? "لا شيء عليك" : "Nothing owed";
}

/** The short statement a person sends the supplier on WhatsApp, to agree the account. */
export function statementMessage(
  statement: SupplierStatement,
  options: { lang: Lang; store: string; money: (n: number) => string },
): string {
  const { lang, money } = options;
  const owes = (n: number) =>
    n > 0
      ? money(n)
      : n < 0
        ? lang === "ar"
          ? `${money(-n)} لنا عندكم`
          : `${money(-n)} in our favour`
        : money(0);
  if (lang === "ar") {
    return [
      `السلام عليكم ${statement.supplier}،`,
      `هذا كشف حسابكم مع ${options.store} (${rangeText(statement.range, lang)}):`,
      `الرصيد السابق: ${owes(statement.opening)}`,
      `الطلبيات: ${money(statement.ordered)}`,
      `المدفوع: ${money(statement.paid)}`,
      `الرصيد الآن: ${owes(statement.closing)}`,
      "نرجو مطابقته معنا، وشكراً لكم.",
    ].join("\n");
  }
  return [
    `Hello ${statement.supplier},`,
    `Here is your account with ${options.store} (${rangeText(statement.range, lang)}):`,
    `Balance before: ${owes(statement.opening)}`,
    `Orders: ${money(statement.ordered)}`,
    `Paid: ${money(statement.paid)}`,
    `Balance now: ${owes(statement.closing)}`,
    "Please check it against yours. Thank you.",
  ].join("\n");
}
