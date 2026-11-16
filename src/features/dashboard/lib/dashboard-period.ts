import { countOf } from "@/lib/arabic-count";

/**
 * The dashboard's period: the last 7, 30 or 90 days (30 by default), kept in the address as
 * `?days=` so a link opens the same view. Every figure on the page reads it: the Reports
 * overview and the period before it, the daily chart, the sales counted for staff without the
 * finances and the visits. It was 30 days and nothing else.
 */
export const DASHBOARD_PERIODS = [7, 30, 90] as const;
export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];
export const DEFAULT_PERIOD: DashboardPeriod = 30;

/** A period read from the address: one of the three, else the default. */
export function readPeriod(value: unknown): DashboardPeriod {
  const days = Number(value);
  return (DASHBOARD_PERIODS as readonly number[]).includes(days)
    ? (days as DashboardPeriod)
    : DEFAULT_PERIOD;
}

/** The address's search for a period: nothing for the default. */
export function periodSearch(days: DashboardPeriod): { days?: DashboardPeriod } {
  return days === DEFAULT_PERIOD ? {} : { days };
}

/** The period's words: "آخر 7 أيام", "the last 30 days", "الـ 90 يومًا السابقة". */
export function periodWords(days: number, lang: "ar" | "en") {
  const span = countOf(days, "day", lang);
  return lang === "ar"
    ? { span, last: `آخر ${span}`, before: `الـ ${span} السابقة` }
    : { span, last: `the last ${span}`, before: `the ${span} before` };
}

/**
 * The period's bounds: from midnight `days - 1` days ago to now, the same length before it, and
 * how far back the orders read reaches (the period with 15 days more, and never less than the 45
 * days the stock pace looks at).
 */
export function periodBounds(days: number, now: Date) {
  const end = new Date(now);
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);
  const previousEnd = new Date(start.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - (end.getTime() - start.getTime()));
  const ordersSince = new Date(start);
  ordersSince.setDate(ordersSince.getDate() - 15);
  const stockFloor = new Date(end);
  stockFloor.setDate(stockFloor.getDate() - 45);
  stockFloor.setHours(0, 0, 0, 0);
  const since = ordersSince < stockFloor ? ordersSince : stockFloor;
  return { start, end, previousStart, previousEnd, ordersSince: since.toISOString() };
}
