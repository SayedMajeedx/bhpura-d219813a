import { endOfDay, startOfDay, subDays } from "date-fns";
import {
  productAvailability,
  readyUnitsOf,
  type ProductAvailability,
} from "@/lib/product-availability";

/**
 * The Reports pages' default period: the last 30 calendar days, today
 * included (from the start of the day 29 days ago to the end of today).
 */
export function defaultReportRange(now: Date = new Date()): { from: Date; to: Date } {
  return { from: subDays(startOfDay(now), 29), to: endOfDay(now) };
}

type BreakdownRow = { currency?: string | null } & Record<string, unknown>;

/**
 * One breakdown of `rpc_reporting_sales` (payment or fulfillment methods, the
 * keys the RPC returns) in one currency.
 */
export function salesBreakdownRows(
  report: unknown,
  breakdown: "payment" | "fulfillment",
  currency: string,
): BreakdownRow[] {
  const rows = (report as Partial<Record<"payment" | "fulfillment", BreakdownRow[]>> | null)?.[
    breakdown
  ];
  return (rows ?? []).filter((row) => row.currency === currency);
}

/**
 * A period picked on the calendar, as whole days on the reader's clock: from the first day's
 * start to the last day's end. The calendar hands back midnights, so a picked range ended at
 * the start of its last day (that day's orders were left out) and one picked day was empty.
 * One click (no end yet) is that day alone.
 */
export function wholeDays<T extends { from?: Date; to?: Date }>(
  range: T | undefined,
): { from: Date; to: Date } | undefined {
  if (!range?.from) return undefined;
  return { from: startOfDay(range.from), to: endOfDay(range.to ?? range.from) };
}

/** A products report row: a size sold in the period, with what is ready and how it is sold. */
export type ReportStockRow = {
  stock_main?: number | string | null;
  stock_incubator?: number | string | null;
  current_stock?: number | string | null;
  is_made_to_order?: boolean | null;
  item_kind?: string | null;
  made_to_order_available?: number | string | null;
  made_to_order_paused_at?: string | null;
};

/**
 * How a size stands now, by the one availability rule and the store's low-stock level: a
 * made-to-order piece is not "out of stock" for having no ready pieces, a service has nothing
 * to count, and pieces at partners count as ready. A row with no split of its stock (a
 * partner sale) counts its `current_stock` as the store's.
 */
export function reportStockState(row: ReportStockRow, lowStockUnits: number): ProductAvailability {
  const split = row.stock_main !== undefined || row.stock_incubator !== undefined;
  const variant = split
    ? { stock_main: row.stock_main, stock_incubator: row.stock_incubator }
    : { stock_main: row.current_stock };
  return productAvailability(row, readyUnitsOf([variant]), 0, lowStockUnits);
}
