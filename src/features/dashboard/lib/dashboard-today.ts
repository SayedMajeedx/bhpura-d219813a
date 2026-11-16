import { orderReleased } from "@/lib/order-released";
import type { DashboardFigures } from "@/features/dashboard/lib/dashboard-figures";

/**
 * What the dashboard says about today, read from the orders it already holds and, for staff who
 * see the finances, the last day of the Reports sales series: the orders placed today, today's
 * net sales, and what is still to collect on the orders not finished yet. The dashboard opened
 * on thirty days' figures and had nothing about the day the owner opens it.
 */

type TodayOrder = {
  created_at: string;
  status?: string | null;
  payment_status?: string | null;
  total?: unknown;
  advance_paid?: unknown;
};

const num = (value: unknown) => Number(value ?? 0) || 0;

/** Whether a moment falls on the reader's own today. */
function isToday(moment: string, now: Date) {
  const d = new Date(moment);
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/** An order still being worked on: not finished, not undone, not a draft. */
export function orderOpen(order: Pick<TodayOrder, "status" | "payment_status">) {
  const status = (order.status ?? "").toLowerCase();
  return (
    status !== "completed" &&
    status !== "draft" &&
    !orderReleased(order.status, order.payment_status)
  );
}

export function todayFigures({
  orders,
  dailySeries,
  now,
}: {
  orders: readonly TodayOrder[];
  /** The Reports' daily series (null for staff who may not see the finances). */
  dailySeries: DashboardFigures["dailySeries"] | null;
  now: Date;
}) {
  const ordersToday = orders.filter(
    (o) =>
      isToday(o.created_at, now) &&
      (o.status ?? "") !== "draft" &&
      !orderReleased(o.status, o.payment_status),
  ).length;
  let toCollect = 0;
  let toCollectCount = 0;
  for (const order of orders) {
    if (!orderOpen(order) || (order.payment_status ?? "") === "paid") continue;
    const owed = Math.max(0, num(order.total) - num(order.advance_paid));
    if (owed < 0.0005) continue;
    toCollect += owed;
    toCollectCount += 1;
  }
  const last = dailySeries?.[dailySeries.length - 1];
  const today = last && isToday(`${last.key}T12:00:00`, now) ? last : null;
  return {
    ordersToday,
    salesToday: dailySeries ? (today?.sales ?? 0) : null,
    toCollect,
    toCollectCount,
  };
}

export type TodayFigures = ReturnType<typeof todayFigures>;

/** One line of "needs your attention": what it is, how many, and where it is done. */
export type AttentionKind = "prepare" | "appointments" | "returns" | "low_stock";

/** The counts that need a person, in the order they are worked: never one with nothing in it. */
export function attentionLines(counts: Record<AttentionKind, number>) {
  const order: AttentionKind[] = ["appointments", "prepare", "returns", "low_stock"];
  return order.filter((kind) => counts[kind] > 0).map((kind) => ({ kind, count: counts[kind] }));
}
