import { endOfDay, startOfDay, subDays } from "date-fns";

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
