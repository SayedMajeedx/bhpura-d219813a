import { COUNT_FORMAT, moneyFormat, type XCell, type XSheet } from "./workbook";

/**
 * What customers owe the store today, and for how long (`rpc_reporting_receivables`). A boutique's
 * balance falls due when the piece is handed over (an advance is paid, the rest on delivery), so
 * a balance is aged from the hand-over, by whole days on the reader's calendar: before it, the
 * balance is not yet due; then 0-30, 31-60, 61-90 and over 90 days. Each customer's orders
 * together, the oldest and largest first.
 */

export type OpenOrder = {
  id: string;
  invoice_number: number | null;
  public_invoice_token: string | null;
  created_at: string;
  handed_over_at: string | null;
  currency: string;
  status: string | null;
  fulfillment_status: string | null;
  payment_method: string | null;
  total: number;
  collected: number;
  balance: number;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
};

export type PartnerBalance = {
  id: string;
  name: string;
  currency: string;
  due: number;
  overdue: number;
  next_settlement: string | null;
};

export type AgeBucket = "not_due" | "d0_30" | "d31_60" | "d61_90" | "d90_plus";

export const AGE_BUCKETS: AgeBucket[] = ["not_due", "d0_30", "d31_60", "d61_90", "d90_plus"];

export const BUCKET_WORDS: Record<AgeBucket, { en: string; ar: string }> = {
  not_due: { en: "Not yet due", ar: "لم يستحق بعد" },
  d0_30: { en: "0–30 days", ar: "0–30 يوماً" },
  d31_60: { en: "31–60 days", ar: "31–60 يوماً" },
  d61_90: { en: "61–90 days", ar: "61–90 يوماً" },
  d90_plus: { en: "Over 90 days", ar: "أكثر من 90 يوماً" },
};

const num = (value: unknown) => Number(value ?? 0) || 0;
const text = (value: unknown) => (value === null || value === undefined ? null : String(value));

export function readReceivables(value: unknown): {
  orders: OpenOrder[];
  partners: PartnerBalance[];
} {
  const data = (value ?? {}) as { customers?: unknown; partners?: unknown };
  const list = (v: unknown) => (Array.isArray(v) ? (v as Array<Record<string, unknown>>) : []);
  return {
    orders: list(data.customers).map((o) => ({
      id: String(o.id),
      invoice_number: o.invoice_number === null ? null : num(o.invoice_number),
      public_invoice_token: text(o.public_invoice_token),
      created_at: String(o.created_at),
      handed_over_at: text(o.handed_over_at),
      currency: String(o.currency ?? ""),
      status: text(o.status),
      fulfillment_status: text(o.fulfillment_status),
      payment_method: text(o.payment_method),
      total: num(o.total),
      collected: num(o.collected),
      balance: num(o.balance),
      customer_id: text(o.customer_id),
      customer_name: text(o.customer_name),
      customer_phone: text(o.customer_phone),
    })),
    partners: list(data.partners).map((p) => ({
      id: String(p.id),
      name: String(p.name ?? ""),
      currency: String(p.currency ?? ""),
      due: num(p.due),
      overdue: num(p.overdue),
      next_settlement: text(p.next_settlement),
    })),
  };
}

/** `YYYY-MM-DD` of a moment on the reader's clock. */
export function localDay(moment: string | Date) {
  const d = moment instanceof Date ? moment : new Date(moment);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Whole calendar days from one `YYYY-MM-DD` to another (never negative). */
export function daysBetween(from: string, to: string) {
  const day = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.max(0, Math.round((day(to) - day(from)) / 86_400_000));
}

/** Days since the piece was handed over; null while it has not been. */
export function daysOverdue(order: Pick<OpenOrder, "handed_over_at">, today: string) {
  return order.handed_over_at ? daysBetween(localDay(order.handed_over_at), today) : null;
}

export function ageBucket(days: number | null): AgeBucket {
  if (days === null) return "not_due";
  if (days <= 30) return "d0_30";
  if (days <= 60) return "d31_60";
  if (days <= 90) return "d61_90";
  return "d90_plus";
}

export type BucketTotals = Record<AgeBucket, number> & { total: number };

const emptyTotals = (): BucketTotals => ({
  not_due: 0,
  d0_30: 0,
  d31_60: 0,
  d61_90: 0,
  d90_plus: 0,
  total: 0,
});

export type AgedOrder = OpenOrder & { days: number | null; bucket: AgeBucket };

export type CustomerBalance = {
  key: string;
  name: string;
  phone: string | null;
  orders: AgedOrder[];
  buckets: BucketTotals;
  /** The oldest balance's days since hand-over; null when none is due yet. */
  oldestDays: number | null;
  worst: AgeBucket;
};

/** One currency's open orders, aged, grouped by customer: the most overdue and largest first. */
export function customerBalances(
  orders: readonly OpenOrder[],
  currency: string,
  today: string,
  unnamed: string,
): CustomerBalance[] {
  const groups = new Map<string, CustomerBalance>();
  for (const order of orders) {
    if (order.currency !== currency) continue;
    const days = daysOverdue(order, today);
    const aged: AgedOrder = { ...order, days, bucket: ageBucket(days) };
    const key =
      order.customer_id ??
      (order.customer_phone ? `phone:${order.customer_phone}` : `order:${order.id}`);
    const group = groups.get(key) ?? {
      key,
      name: order.customer_name?.trim() || unnamed,
      phone: order.customer_phone,
      orders: [],
      buckets: emptyTotals(),
      oldestDays: null,
      worst: "not_due" as AgeBucket,
    };
    group.orders.push(aged);
    group.buckets[aged.bucket] += order.balance;
    group.buckets.total += order.balance;
    if (days !== null && (group.oldestDays === null || days > group.oldestDays)) {
      group.oldestDays = days;
    }
    if (AGE_BUCKETS.indexOf(aged.bucket) > AGE_BUCKETS.indexOf(group.worst)) {
      group.worst = aged.bucket;
    }
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((g) => ({
      ...g,
      orders: [...g.orders].sort((a, b) => (b.days ?? -1) - (a.days ?? -1)),
    }))
    .sort(
      (a, b) =>
        AGE_BUCKETS.indexOf(b.worst) - AGE_BUCKETS.indexOf(a.worst) ||
        b.buckets.total - a.buckets.total,
    );
}

export function bucketTotals(customers: readonly CustomerBalance[]): BucketTotals & {
  customers: number;
  orders: number;
} {
  const totals = emptyTotals();
  let orders = 0;
  for (const c of customers) {
    for (const key of [...AGE_BUCKETS, "total"] as const) totals[key] += c.buckets[key];
    orders += c.orders.length;
  }
  return { ...totals, customers: customers.length, orders };
}

/** What is overdue: due and past 30 days since hand-over. */
export const pastThirty = (t: BucketTotals) => t.d31_60 + t.d61_90 + t.d90_plus;

export const BALANCE_COLUMNS = {
  customer: { en: "Customer", ar: "العميل" },
  order: { en: "Order", ar: "الطلب" },
  ordered: { en: "Ordered", ar: "تاريخ الطلب" },
  handedOver: { en: "Handed over", ar: "تاريخ التسليم" },
  days: { en: "Days since hand-over", ar: "أيام منذ التسليم" },
  age: { en: "Age", ar: "العمر" },
  total: { en: "Order total", ar: "قيمة الطلب" },
  collected: { en: "Collected", ar: "المحصّل" },
  balance: { en: "Balance", ar: "المتبقي" },
  method: { en: "Payment method", ar: "طريقة الدفع" },
  summary: { en: "Summary", ar: "الملخص" },
  orders: { en: "Orders", ar: "الطلبات" },
  partners: { en: "Partner shops", ar: "المحلات الشريكة" },
  due: { en: "Owed", ar: "المستحق" },
  overdue: { en: "Overdue", ar: "متأخر" },
  next: { en: "Next settlement", ar: "التسوية القادمة" },
};

/** The balances as an Excel sheet: the ageing summary, then every open order. No phone numbers. */
export function balancesSheet(input: {
  customers: CustomerBalance[];
  partners: PartnerBalance[];
  currency: string;
  digits: number;
  lang: "ar" | "en";
  title: string;
  subtitle: string;
}): XSheet {
  const { customers, partners, currency, digits, lang, title, subtitle } = input;
  const w = (words: { en: string; ar: string }) => words[lang];
  const money = moneyFormat(digits);
  const totals = bucketTotals(customers);
  const date = (iso: string | null): XCell => (iso ? { value: localDay(iso), text: true } : null);
  const head = (value: string): XCell => ({ value, heading: true });
  const mine = partners.filter((p) => p.currency === currency);

  return {
    name: title,
    rtl: lang === "ar",
    stickyColumns: 1,
    widths: [30, 12, 12, 14, 12, 14, 14, 14, 14, 16],
    rows: [
      [{ value: title, bold: true }],
      [{ value: subtitle }],
      [],
      [head(w(BALANCE_COLUMNS.summary)), head(currency)],
      ...AGE_BUCKETS.map((b) => [
        { value: w(BUCKET_WORDS[b]) },
        { value: totals[b], format: money },
      ]),
      [
        { value: w(BALANCE_COLUMNS.balance), total: true },
        { value: totals.total, format: money, total: true },
      ],
      [],
      [
        head(w(BALANCE_COLUMNS.customer)),
        head(w(BALANCE_COLUMNS.order)),
        head(w(BALANCE_COLUMNS.ordered)),
        head(w(BALANCE_COLUMNS.handedOver)),
        head(w(BALANCE_COLUMNS.days)),
        head(w(BALANCE_COLUMNS.age)),
        head(w(BALANCE_COLUMNS.total)),
        head(w(BALANCE_COLUMNS.collected)),
        head(w(BALANCE_COLUMNS.balance)),
        head(w(BALANCE_COLUMNS.method)),
      ],
      ...customers.flatMap((c) =>
        c.orders.map((o) => [
          { value: c.name },
          { value: o.invoice_number === null ? null : String(o.invoice_number), text: true },
          date(o.created_at),
          date(o.handed_over_at),
          o.days === null ? null : { value: o.days, format: COUNT_FORMAT },
          { value: w(BUCKET_WORDS[o.bucket]) },
          { value: o.total, format: money },
          { value: o.collected, format: money },
          { value: o.balance, format: money, bold: true },
          { value: o.payment_method },
        ]),
      ),
      ...(mine.length > 0
        ? [
            [],
            [
              head(w(BALANCE_COLUMNS.partners)),
              head(w(BALANCE_COLUMNS.due)),
              head(w(BALANCE_COLUMNS.overdue)),
              head(w(BALANCE_COLUMNS.next)),
            ],
            ...mine.map((p) => [
              { value: p.name },
              { value: p.due, format: money },
              { value: p.overdue, format: money },
              p.next_settlement ? { value: p.next_settlement, text: true } : null,
            ]),
          ]
        : []),
    ],
  };
}
