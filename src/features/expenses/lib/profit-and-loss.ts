import { overviewProfit, type ComposedOverviewRow } from "@/lib/reporting-compose";
import { startOfLocalDay } from "@/lib/day-range";

/**
 * The expenses page's profit and loss: the Reports' own figures for the page's period (the
 * overview's `composeOverviewRows` and `overviewProfit`), so the strip, the accounting tab's
 * statement, the Reports overview and the monthly statement say the same for the same days.
 * The page once worked its own out in the browser: revenue from order totals (VAT and delivery
 * in, partner shops' sales and returns out), packaging from today's materials, fees on the whole
 * total and running costs from the expenses the list's search happened to show.
 */

export type PeriodFigures = {
  /** After discounts and returns, partner shops' sales included. */
  netSales: number;
  productCost: number;
  packagingCost: number;
  partnerCost: number;
  /** Cost of goods after a restocked return gave its cost back. */
  costOfGoods: number;
  grossProfit: number;
  grossMargin: number;
  runningCosts: number;
  paymentFees: number;
  partnerCommissions: number;
  operatingCosts: number;
  operatingProfit: number;
  operatingMargin: number;
  /** Pieces sold with no cost recorded: profit is overstated by their cost. */
  missingCosts: number;
};

/** The period's figures in the store's currency; null until they arrive. */
export function periodFigures(
  rows: ReadonlyArray<Partial<ComposedOverviewRow>> | null | undefined,
  currency: string,
): PeriodFigures | null {
  if (!rows) return null;
  const row = rows.find((r) => r.currency === currency) ?? {};
  const profit = overviewProfit(row);
  const num = (value: unknown) => Number(value ?? 0) || 0;
  return {
    netSales: profit.netSales,
    productCost: num(row.product_cogs),
    packagingCost: num(row.packaging_cogs),
    partnerCost: num(row.incubator_cogs),
    costOfGoods: profit.costOfGoods,
    grossProfit: profit.grossProfit,
    grossMargin: profit.grossMargin,
    runningCosts: num(row.manual_expenses),
    paymentFees: num(row.processing_fees),
    partnerCommissions: num(row.incubator_commissions),
    operatingCosts: profit.operatingCosts,
    operatingProfit: profit.operatingProfit,
    operatingMargin: profit.operatingMargin,
    missingCosts: num(row.missing_cost_item_count),
  };
}

/**
 * The page's days (`YYYY-MM-DD`, the reader's calendar) as the Reports' period: from the first
 * day's midnight to the last millisecond of the last day. Undefined for a range not yet chosen.
 */
export function reportRangeOfDays(from: string, to: string): { from: Date; to: Date } | undefined {
  const start = startOfLocalDay(from);
  const after = startOfLocalDay(to, 1);
  if (!start || !after) return undefined;
  return { from: start, to: new Date(after.getTime() - 1) };
}
