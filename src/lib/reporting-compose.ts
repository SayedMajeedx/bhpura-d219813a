/**
 * The Reports figures for one period, put together from what the database's report functions
 * answer: the overview, processed returns, cost of goods, payment fees and partner shops' sales.
 * The overview (one period) and the monthly statement (many, from `rpc_reporting_periods`) both
 * go through it, so a month on the statement is exactly that month on the overview.
 *
 * And the one reading of profit: net sales after returns, less the cost of goods after returns,
 * is gross profit; less running costs, payment fees and partner commissions, operating profit.
 */

type Row = Record<string, unknown>;

const num = (value: unknown) => Number(value ?? 0) || 0;
const rows = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]) : []);

export type OverviewPieces = {
  overview: unknown;
  returns: unknown;
  cogs: unknown;
  fees: unknown;
  incubatorSummary: unknown;
};

/** A period's figures, one row per currency the store sold in. */
export type ComposedOverviewRow = Row & {
  currency: string;
  paid_order_value: number;
  gross_merch_sales: number;
  discounts: number;
  net_merch_sales: number;
  net_merchandise_after_returns: number;
  net_revenue: number;
  refunded_total: number;
  refunded_merchandise: number;
  paid_order_count: number;
  shipping_collected: number;
  vat_collected: number;
  collected: number;
  owed_by_customers: number;
  known_cogs: number;
  known_cogs_after_returns: number;
  returned_cogs_reversal: number;
  missing_cost_item_count: number;
  missing_cost_exposure: number;
  manual_expenses: number;
  processing_fees: number;
  incubator_commissions: number;
  incubator_sales: number;
  incubator_receivables: number;
  incubator_collected: number;
  expenses: number;
};

export function composeOverviewRows(pieces: OverviewPieces): ComposedOverviewRow[] {
  const baseRows = rows(pieces.overview).map((row) => ({ ...row }));
  const incubatorRows = rows(pieces.incubatorSummary);
  const refundRows = rows(pieces.returns);
  const cogsRows = rows(pieces.cogs);
  for (const extra of [incubatorRows, refundRows, cogsRows]) {
    for (const row of extra) {
      if (!baseRows.some((base) => base.currency === row.currency)) {
        baseRows.push({ currency: row.currency });
      }
    }
  }
  const byCurrency = (list: Row[]) => new Map(list.map((row) => [row.currency, row]));
  const incubatorByCurrency = byCurrency(incubatorRows);
  const refundsByCurrency = byCurrency(refundRows);
  const cogsByCurrency = byCurrency(cogsRows);
  const feesByCurrency = new Map(
    rows(pieces.fees).map((row) => [row.currency, num(row.processing_fees)]),
  );

  return baseRows.map((row) => {
    const consignment = incubatorByCurrency.get(row.currency) ?? {};
    const refunds = refundsByCurrency.get(row.currency) ?? {};
    const orderCogs = cogsByCurrency.get(row.currency) ?? {};
    const processingFees = feesByCurrency.get(row.currency) ?? 0;
    const manualExpenses = num(row.expenses);
    const incubatorCommissions = num(consignment.commission_amount);
    const paidOrderValue = num(row.paid_order_value) + num(consignment.gross_amount);
    const netMerchandise = num(row.net_merch_sales) + num(consignment.gross_amount);
    const storeCogs = num(orderCogs.known_cogs ?? row.known_cogs);
    return {
      ...row,
      currency: String(row.currency ?? ""),
      paid_order_value: paidOrderValue,
      gross_merch_sales: num(row.gross_merch_sales) + num(consignment.gross_amount),
      discounts: num(row.discounts),
      net_merch_sales: netMerchandise,
      refunded_total: num(refunds.refunded_total ?? row.refunded_total),
      refunded_merchandise: num(refunds.refunded_merchandise),
      net_revenue: paidOrderValue - num(refunds.revenue_deduction),
      net_merchandise_after_returns: netMerchandise - num(refunds.merchandise_deduction),
      paid_order_count: num(row.paid_order_count) + num(consignment.sale_count),
      shipping_collected: num(row.shipping_collected),
      vat_collected: num(row.vat_collected),
      // What was paid on the period's sales: by customers on store orders, by partners on theirs.
      // What partners still owe is incubator_receivables; owed_by_customers is store orders only.
      collected: num(row.collected) + num(consignment.collected),
      owed_by_customers: num(row.owed_by_customers),
      product_cogs: num(orderCogs.product_cogs),
      packaging_cogs: num(orderCogs.packaging_cogs),
      incubator_cogs: num(consignment.cogs),
      missing_product_link_count: num(orderCogs.missing_product_link_count),
      zero_packaging_item_count: num(orderCogs.zero_packaging_item_count),
      missing_cost_item_count: num(row.missing_cost_item_count),
      missing_cost_exposure: num(row.missing_cost_exposure),
      known_cogs: storeCogs + num(consignment.cogs),
      known_cogs_after_returns: Math.max(
        0,
        storeCogs + num(consignment.cogs) - num(refunds.returned_cogs_reversal),
      ),
      returned_cogs_reversal: num(refunds.returned_cogs_reversal),
      manual_expenses: manualExpenses,
      processing_fees: processingFees,
      incubator_commissions: incubatorCommissions,
      incubator_sales: num(consignment.gross_amount),
      incubator_receivables: num(consignment.receivables),
      incubator_collected: num(consignment.collected),
      expenses: manualExpenses + processingFees + incubatorCommissions,
    };
  });
}

/** The one reading of profit, for the overview and the statement alike. */
export function overviewProfit(row: Partial<ComposedOverviewRow> | null | undefined) {
  const netSales = num(row?.net_merchandise_after_returns ?? row?.net_merch_sales);
  const costOfGoods = num(row?.known_cogs_after_returns ?? row?.known_cogs);
  const grossProfit = netSales - costOfGoods;
  const operatingCosts = num(row?.expenses);
  const operatingProfit = grossProfit - operatingCosts;
  return {
    netSales,
    costOfGoods,
    grossProfit,
    grossMargin: netSales > 0 ? (grossProfit / netSales) * 100 : 0,
    operatingCosts,
    operatingProfit,
    operatingMargin: netSales > 0 ? (operatingProfit / netSales) * 100 : 0,
  };
}
