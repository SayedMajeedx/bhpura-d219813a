import { resolvePaymentStatus } from "@/lib/payment-status";

/**
 * What an order's card in the list says on a phone, beyond its number, total
 * and customer: when it was placed, what was ordered, and whether there is a
 * next step to offer. The card once showed its stage twice (the badge, then a
 * "done" pill where the next step goes) and neither its date nor its pieces.
 */

type OrderLike = {
  status?: string | null;
  fulfillment_status?: string | null;
  payment_status?: string | null;
  total?: number | string | null;
  advance_paid?: number | string | null;
};

/** Where an order stands, as the list's next-step button reads it. */
export function orderSettledState(o: OrderLike): {
  delivered: boolean;
  cancelled: boolean;
  refunded: boolean;
} {
  const stage = String(o.fulfillment_status || "ON_HOLD").toUpperCase();
  const status = String(o.status || "").toUpperCase();
  return {
    delivered:
      ["COMPLETED", "DELIVERED"].includes(stage) || ["COMPLETED", "DELIVERED"].includes(status),
    cancelled: stage === "CANCELLED" || status === "CANCELLED",
    refunded:
      resolvePaymentStatus(
        o.payment_status ?? null,
        o.status ?? null,
        Number(o.total),
        Number(o.advance_paid ?? 0),
      ) === "refunded",
  };
}

/** True when nothing is left to do from the list: handed over, cancelled or refunded. */
export function orderIsSettled(o: OrderLike): boolean {
  const { delivered, cancelled, refunded } = orderSettledState(o);
  return delivered || cancelled || refunded;
}

/**
 * When an order was placed, as a card says it on the reader's clock: the time
 * for today ("9:15 م"), "Yesterday" with the time, else the day and month.
 */
export function orderCardWhen(
  createdAt: string | null | undefined,
  lang: "ar" | "en",
  now = new Date(),
): string {
  if (!createdAt) return "";
  const placed = new Date(createdAt);
  if (Number.isNaN(placed.getTime())) return "";
  const locale = lang === "ar" ? "ar" : "en-GB";
  const time = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(
    placed,
  );
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const daysAgo = Math.round((day(now) - day(placed)) / 86_400_000);
  if (daysAgo === 0) return time;
  if (daysAgo === 1) return lang === "ar" ? `أمس ${time}` : `Yesterday ${time}`;
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    ...(placed.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  }).format(placed);
}

type ItemLike = {
  description?: string | null;
  name_ar?: string | null;
  name_en?: string | null;
  quantity?: number | string | null;
};

/**
 * What was ordered, in one line: the first piece with its quantity, and how
 * many other lines follow ("Sabika abaya × 2", "+1"). Null with no lines.
 */
export function orderItemsLine(
  items: readonly ItemLike[] | null | undefined,
  lang: "ar" | "en",
): { first: string; more: number } | null {
  const lines = (items ?? []).filter(Boolean);
  if (lines.length === 0) return null;
  const item = lines[0];
  const name =
    (lang === "ar" ? item.name_ar || item.description : item.name_en || item.description) ||
    item.description ||
    item.name_ar ||
    item.name_en ||
    "";
  const qty = Number(item.quantity) || 1;
  return { first: qty > 1 ? `${name} × ${qty}` : name, more: lines.length - 1 };
}
