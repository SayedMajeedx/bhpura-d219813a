import { overviewProfit, type ComposedOverviewRow } from "@/lib/reporting-compose";

/**
 * The monthly statement: the Reports overview's figures, month by month, laid out as a profit
 * and loss statement a finance head reads (sales down to net sales, cost of goods, gross
 * profit, operating costs, operating profit, then figures for reference), with the total of the
 * months and, beside it, the same months a year earlier. Every figure is the overview's own
 * (`composeOverviewRows`, `overviewProfit`), so a month here is that month on the overview.
 *
 * Basis: accrual. A sale counts in the month its order was placed, in full, once it counts as
 * sold; a return is deducted in the month it was processed; running costs by their own date.
 */

export type StatementMonth = {
  /** "2026-10" */
  key: string;
  year: number;
  /** 1 to 12 */
  month: number;
  /** The month's first moment on the reader's clock. */
  from: Date;
  /** Its last moment (the reports' periods end at the last millisecond of their last day). */
  to: Date;
  /** The month has not ended yet: its figures are to date. */
  toDate: boolean;
};

export type StatementPreset = "last12" | "last6" | "thisYear" | "lastYear";

export const STATEMENT_PRESETS: StatementPreset[] = ["last12", "last6", "thisYear", "lastYear"];

function monthOf(year: number, month: number, now: Date): StatementMonth {
  const from = new Date(year, month - 1, 1);
  const next = new Date(year, month, 1);
  return {
    key: `${year}-${String(month).padStart(2, "0")}`,
    year,
    month,
    from,
    to: new Date(next.getTime() - 1),
    toDate: now >= from && now < next,
  };
}

/** `count` months ending with the month of `year`/`month`, oldest first. */
export function monthsEnding(
  year: number,
  month: number,
  count: number,
  now = new Date(),
): StatementMonth[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(year, month - 1 - (count - 1 - i), 1);
    return monthOf(d.getFullYear(), d.getMonth() + 1, now);
  });
}

export function presetMonths(preset: StatementPreset, now = new Date()): StatementMonth[] {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (preset === "last6") return monthsEnding(year, month, 6, now);
  if (preset === "thisYear") return monthsEnding(year, month, month, now);
  if (preset === "lastYear") return monthsEnding(year - 1, 12, 12, now);
  return monthsEnding(year, month, 12, now);
}

/** The same months, a year earlier. */
export function yearEarlier(months: readonly StatementMonth[], now = new Date()) {
  return months.map((m) => monthOf(m.year - 1, m.month, now));
}

export type LineKind = "item" | "subtotal" | "total" | "ratio" | "count" | "memo";

export type StatementLine = {
  key: string;
  kind: LineKind;
  label: { ar: string; en: string };
  /** One figure per month; a deduction is negative. A ratio is a percentage. */
  values: number[];
  total: number;
  /** The same months a year earlier, when asked for. */
  prior: number | null;
  /** Change against `prior`: a percentage, or percentage points for a ratio. */
  change: number | null;
  /** In the reference section, below operating profit. */
  reference?: boolean;
  /** A data-quality line: worth a look when not zero. */
  warning?: boolean;
  /** Its own section after the reference lines: gift cards (`giftCardStatementLines`). */
  section?: "gift_cards";
};

type Row = Partial<ComposedOverviewRow> | undefined;

const num = (value: unknown) => Number(value ?? 0) || 0;
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const ratio = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);

type LineSpec = {
  key: string;
  kind: LineKind;
  label: { ar: string; en: string };
  value: (row: Row) => number;
  /** Shown only when some month has it. */
  optional?: boolean;
  reference?: boolean;
  warning?: boolean;
  /** How a total and a ratio are made from the columns' totals. */
  ofTotals?: (totals: Record<string, number>) => number;
};

const profit = (row: Row) => overviewProfit(row);

const LINES: LineSpec[] = [
  {
    key: "gross_sales",
    kind: "item",
    label: { en: "Gross sales", ar: "إجمالي المبيعات" },
    value: (r) => num(r?.gross_merch_sales),
  },
  {
    key: "discounts",
    kind: "item",
    label: { en: "Discounts", ar: "الخصومات" },
    value: (r) => -num(r?.discounts),
    optional: true,
  },
  {
    key: "returns",
    kind: "item",
    label: { en: "Returns", ar: "المرتجعات" },
    value: (r) => -(num(r?.net_merch_sales) - num(r?.net_merchandise_after_returns)),
    optional: true,
  },
  {
    key: "net_sales",
    kind: "subtotal",
    label: { en: "Net sales", ar: "صافي المبيعات" },
    value: (r) => profit(r).netSales,
  },
  {
    key: "cost_of_goods",
    kind: "item",
    label: { en: "Cost of goods", ar: "تكلفة البضاعة" },
    value: (r) => -profit(r).costOfGoods,
  },
  {
    key: "gross_profit",
    kind: "subtotal",
    label: { en: "Gross profit", ar: "مجمل الربح" },
    value: (r) => profit(r).grossProfit,
  },
  {
    key: "gross_margin",
    kind: "ratio",
    label: { en: "Gross margin", ar: "هامش مجمل الربح" },
    value: (r) => profit(r).grossMargin,
    ofTotals: (t) => ratio(t.gross_profit, t.net_sales),
  },
  {
    key: "running_costs",
    kind: "item",
    label: { en: "Running costs", ar: "المصاريف التشغيلية" },
    value: (r) => -num(r?.manual_expenses),
  },
  {
    key: "payment_fees",
    kind: "item",
    label: { en: "Payment fees", ar: "رسوم الدفع" },
    value: (r) => -num(r?.processing_fees),
    optional: true,
  },
  {
    key: "partner_commissions",
    kind: "item",
    label: { en: "Partner shops' commission", ar: "عمولات المحلات الشريكة" },
    value: (r) => -num(r?.incubator_commissions),
    optional: true,
  },
  {
    key: "operating_costs",
    kind: "subtotal",
    label: { en: "Total operating costs", ar: "مجموع المصاريف" },
    value: (r) => -profit(r).operatingCosts,
  },
  {
    key: "operating_profit",
    kind: "total",
    label: { en: "Operating profit", ar: "الربح التشغيلي" },
    value: (r) => profit(r).operatingProfit,
  },
  {
    key: "operating_margin",
    kind: "ratio",
    label: { en: "Operating margin", ar: "هامش الربح التشغيلي" },
    value: (r) => profit(r).operatingMargin,
    ofTotals: (t) => ratio(t.operating_profit, t.net_sales),
  },
  {
    key: "orders",
    kind: "count",
    label: { en: "Orders", ar: "الطلبات" },
    value: (r) => num(r?.paid_order_count),
    reference: true,
  },
  {
    key: "average_order",
    kind: "memo",
    label: { en: "Average order value", ar: "متوسط قيمة الطلب" },
    // As the overview reads it: what was charged after returns, per order.
    value: (r) => {
      const orders = num(r?.paid_order_count);
      return orders > 0 ? num(r?.net_revenue) / orders : 0;
    },
    reference: true,
    ofTotals: (t) => (t.orders > 0 ? t.order_value / t.orders : 0),
  },
  {
    key: "collected",
    kind: "memo",
    label: { en: "Collected on these sales", ar: "المحصّل من هذه المبيعات" },
    value: (r) => num(r?.collected),
    reference: true,
  },
  {
    key: "owed_by_customers",
    kind: "memo",
    label: { en: "Still owed by customers", ar: "باقي على العملاء" },
    value: (r) => num(r?.owed_by_customers),
    reference: true,
    optional: true,
  },
  {
    key: "delivery_charged",
    kind: "memo",
    label: { en: "Delivery charged to customers", ar: "رسوم التوصيل المحصّلة من العملاء" },
    value: (r) => num(r?.shipping_collected),
    reference: true,
    optional: true,
  },
  {
    key: "vat_charged",
    kind: "memo",
    label: {
      en: "VAT charged (owed to the tax authority)",
      ar: "ضريبة القيمة المضافة المحصّلة (مستحقة للجهة الضريبية)",
    },
    value: (r) => num(r?.vat_collected),
    reference: true,
    optional: true,
  },
  {
    key: "missing_costs",
    kind: "count",
    label: { en: "Pieces sold with no cost recorded", ar: "قطع مبيعة بلا تكلفة مسجلة" },
    value: (r) => num(r?.missing_cost_item_count),
    reference: true,
    optional: true,
    warning: true,
  },
];

/** What the average order value's total is made from: charged after returns. */
const order_value = (r: Row) => num(r?.net_revenue);

function totalsOf(columns: Row[]) {
  const totals: Record<string, number> = { order_value: sum(columns.map(order_value)) };
  for (const spec of LINES) {
    if (spec.ofTotals) continue;
    totals[spec.key] = sum(columns.map(spec.value));
  }
  for (const spec of LINES) {
    if (spec.ofTotals) totals[spec.key] = spec.ofTotals(totals);
  }
  return totals;
}

function changeOf(kind: LineKind, total: number, prior: number | null) {
  if (prior === null) return null;
  if (kind === "ratio") return total - prior;
  if (prior === 0) return null;
  return ((total - prior) / Math.abs(prior)) * 100;
}

/**
 * The statement's lines for these months' figures (one row per month, in the chosen currency)
 * and, when given, the same months a year earlier. A line the store never uses is left out.
 */
export function statementLines(columns: Row[], priorColumns?: Row[] | null): StatementLine[] {
  const totals = totalsOf(columns);
  const priorTotals = priorColumns ? totalsOf(priorColumns) : null;
  return LINES.flatMap((spec) => {
    const values = columns.map(spec.value);
    const prior = priorTotals ? priorTotals[spec.key] : null;
    const used =
      values.some((v) => Math.abs(v) > 0.0005) ||
      (priorColumns ?? []).some((r) => Math.abs(spec.value(r)) > 0.0005);
    if (spec.optional && !used) return [];
    const total = totals[spec.key];
    return [
      {
        key: spec.key,
        kind: spec.kind,
        label: spec.label,
        values,
        total,
        prior,
        change: changeOf(spec.kind, total, prior),
        reference: spec.reference,
        warning: spec.warning,
      },
    ];
  });
}

/** The row of one currency in each month's figures (a month with no sale has none). */
export function columnsIn(
  periods: ReadonlyArray<ReadonlyArray<ComposedOverviewRow>>,
  currency: string,
): Row[] {
  return periods.map((rows) => rows.find((row) => row.currency === currency));
}

/** The currencies the store sold in over these months, the store's own first. */
export function currenciesIn(
  periods: ReadonlyArray<ReadonlyArray<ComposedOverviewRow>>,
  storeCurrency: string,
): string[] {
  const seen = new Set<string>([storeCurrency]);
  for (const rows of periods) for (const row of rows) if (row.currency) seen.add(row.currency);
  return [...seen];
}

/** "Oct 2026" / "أكتوبر 2026"; Western digits on both sides. */
export function monthLabel(month: StatementMonth, lang: "ar" | "en") {
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-u-nu-latn" : "en-US", {
    month: "short",
    year: "numeric",
  }).format(month.from);
}

/**
 * A figure as a statement writes it: the currency's own decimals, thousands grouped, a negative
 * in parentheses and nothing as a dash; Western digits in both languages.
 */
export function accountingFigure(value: number, digits: number) {
  if (Math.abs(value) < 0.5 * 10 ** -digits) return "–";
  const text = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Math.abs(value));
  return value < 0 ? `(${text})` : text;
}

/** A line's figure in its own kind: money, a whole count or a percentage. */
export function lineFigure(kind: LineKind, value: number, digits: number) {
  if (kind === "ratio") return Math.abs(value) < 0.05 ? "–" : `${value.toFixed(1)}%`;
  if (kind === "count") return accountingFigure(value, 0);
  return accountingFigure(value, digits);
}

/** "+12.4%", "−3.0 pts" ("نقطة"); a dash when there is nothing to compare with. */
export function changeFigure(kind: LineKind, change: number | null, lang: "ar" | "en" = "en") {
  if (change === null || !Number.isFinite(change)) return "–";
  const sign = change > 0 ? "+" : change < 0 ? "−" : "";
  const size = Math.abs(change).toFixed(1);
  if (kind !== "ratio") return `${sign}${size}%`;
  return `${sign}${size} ${lang === "ar" ? "نقطة" : "pts"}`;
}
