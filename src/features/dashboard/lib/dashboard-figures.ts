import { westernNumeralLocale } from "@/lib/format";
import { countsAsSold } from "@/lib/data/orders/sold-orders";
import { overviewProfit, salesBySource, type ComposedOverviewRow } from "@/lib/reporting-compose";
import { splitSalesBucket } from "@/lib/reports-view";

/**
 * The dashboard's figures for the last 30 days, read from the Reports overview's own rows
 * (`salesBySource`, `overviewProfit`) and its daily sales series, so the dashboard and Reports say
 * the same: net sales (before VAT and delivery) split by where they were made, the profit, the
 * store's own orders apart from the partner shops' sales, and the average store order. The
 * dashboard once added order totals up in the browser: 212.800 of "revenue" with VAT and delivery
 * in, its store and partner parts 210.800, where Reports said 204.800 of sales.
 */

type Row = Partial<ComposedOverviewRow> | null | undefined;
/** One day of the Reports sales series (`rpc_reporting_sales`, with its `partner` part). */
export type SeriesRow = {
  time_bucket?: string | null;
  net_merch?: unknown;
  partner?: unknown;
  paid_order_count?: unknown;
  currency?: string | null;
};

const num = (value: unknown) => Number(value ?? 0) || 0;
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** The change against the period before, in percent; none when there is nothing to compare. */
export function deltaPct(current: number, previous: number | null | undefined) {
  if (previous === null || previous === undefined || Math.abs(previous) < 0.0005) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/** The store's own orders and the partner shops' sales, each counted apart. */
function counts(row: Row) {
  const partnerSales = num(row?.incubator_sale_count);
  const storeOrders = Math.max(0, num(row?.paid_order_count) - partnerSales);
  return { storeOrders, partnerSales };
}

/**
 * The thirty days' net sales, day by day: the store's and the partner shops' apart (the Reports
 * sales series, `splitSalesBucket`), every day of the period present even with nothing sold.
 */
export function dailySeries(
  series: readonly SeriesRow[],
  start: Date,
  locale: string,
  currency: string,
  days = 30,
) {
  const byDay = new Map<string, { store: number; partner: number; orders: number }>();
  for (const row of series) {
    if (row.currency && row.currency !== currency) continue;
    const key = String(row.time_bucket ?? "").slice(0, 10);
    if (!key) continue;
    const split = splitSalesBucket(row);
    const day = byDay.get(key) ?? { store: 0, partner: 0, orders: 0 };
    day.store += split.store;
    day.partner += split.partner;
    day.orders += num(row.paid_order_count);
    byDay.set(key, day);
  }
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const day = byDay.get(dayKey(d)) ?? { store: 0, partner: 0, orders: 0 };
    return {
      key: dayKey(d),
      date: d.toLocaleDateString(westernNumeralLocale(locale), { day: "numeric", month: "short" }),
      store: day.store,
      partner: day.partner,
      sales: day.store + day.partner,
      orders: day.orders,
    };
  });
}

export function dashboardFigures({
  row,
  previous,
  series,
  start,
  locale,
  currency,
  days = 30,
}: {
  row: Row;
  previous: Row;
  series: readonly SeriesRow[];
  start: Date;
  locale: string;
  currency: string;
  /** The period's length: one point of the chart per day. */
  days?: number;
}) {
  const sales = salesBySource(row);
  const salesBefore = previous ? salesBySource(previous) : null;
  const profit = overviewProfit(row);
  const profitBefore = previous ? overviewProfit(previous) : null;
  const now = counts(row);
  const before = previous ? counts(previous) : null;
  const average = now.storeOrders > 0 ? sales.store / now.storeOrders : 0;
  const averageBefore =
    before && salesBefore && before.storeOrders > 0 ? salesBefore.store / before.storeOrders : null;
  const transactions = now.storeOrders + now.partnerSales;
  const transactionsBefore = before ? before.storeOrders + before.partnerSales : null;
  return {
    sales,
    salesBefore,
    salesDeltaPct: deltaPct(sales.total, salesBefore?.total),
    netProfit: profit.operatingProfit,
    netProfitBefore: profitBefore?.operatingProfit ?? null,
    grossMarginPercent: profit.grossMargin,
    grossMarginBefore: profitBefore?.grossMargin ?? null,
    cogs: profit.costOfGoods,
    storeOrders: now.storeOrders,
    partnerSales: now.partnerSales,
    transactions,
    transactionsDeltaPct: deltaPct(transactions, transactionsBefore),
    average,
    averageBefore,
    averageDeltaPct: deltaPct(average, averageBefore),
    dailySeries: dailySeries(series, start, locale, currency, days),
  };
}

export type DashboardFigures = ReturnType<typeof dashboardFigures>;

/**
 * For staff who may not see the finances (no Reports overview): how many sales the last 30 days
 * hold, counted as Reports counts them, the store's orders and the partner shops' sales apart.
 */
export function salesCountsSince(
  orders: ReadonlyArray<{ status?: string | null; created_at: string }>,
  /** The partner shops' daily buckets (`fetchIncubatorSales`: the day and its count of sales). */
  partnerSales: ReadonlyArray<{ sold_at?: string | null; quantity?: unknown }>,
  start: Date,
  now: Date,
) {
  const inPeriod = (moment: string | null | undefined) => {
    const t = moment ? Date.parse(moment) : NaN;
    return Number.isFinite(t) && t >= start.getTime() && t <= now.getTime();
  };
  const storeOrders = orders.filter((o) => countsAsSold(o.status) && inPeriod(o.created_at)).length;
  const partner = partnerSales
    .filter((s) => inPeriod(s.sold_at))
    .reduce((sum, s) => sum + num(s.quantity), 0);
  return { storeOrders, partnerSales: partner, transactions: storeOrders + partner };
}
