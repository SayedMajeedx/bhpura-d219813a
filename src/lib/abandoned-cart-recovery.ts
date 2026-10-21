import { countsAsSold } from "@/lib/data/orders/sold-orders";
import { whatsappChatUrl } from "@/lib/whatsapp-phone";
import type { CartRecoveryStatus } from "@/lib/abandoned-carts.types";

/**
 * What the abandoned-carts screen counts, and which carts a person may write to.
 *
 * Nothing is sent by the system: a person opens WhatsApp from a cart and sends the message (the
 * house rule; there is no WhatsApp API connection). The drip sequences and the dispatch log the
 * screen once showed configured a sender that never existed.
 */

export type RecoveryCart = {
  status: CartRecoveryStatus | string;
  subtotal: number | string | null;
  currency?: string | null;
  marketing_consent?: boolean | null;
  guest_phone?: string | null;
  abandoned_at?: string | null;
  recovered_at?: string | null;
  customers?: { phone?: string | null } | null;
  /** The order the cart became (embedded through `recovered_order_id`). */
  orders?: { total?: number | string | null; status?: string | null } | null;
};

/** A cart the shopper may still come back to: not ordered, not emptied, not stopped. */
export function isOpenCart(cart: { status?: string | null }): boolean {
  return cart.status === "active" || cart.status === "abandoned" || cart.status === "recovering";
}

/** A cart that was left past the store's threshold and is still open. */
export function isLeftCart(cart: { status?: string | null }): boolean {
  return cart.status === "abandoned" || cart.status === "recovering";
}

/** The WhatsApp chat of a cart's shopper, only when they agreed to hear about it. */
export function cartChatUrl(cart: RecoveryCart): string | null {
  if (cart.marketing_consent !== true) return null;
  return whatsappChatUrl(cart.guest_phone || cart.customers?.phone);
}

/**
 * What a recovered cart brought in: the order it became, while that order still counts as sold
 * (a cart whose order was cancelled brought nothing). A cart that went straight to checkout is
 * `converted`, not recovered, and is not counted.
 */
export function recoveredValue(cart: RecoveryCart): number {
  if (cart.status !== "recovered" || !cart.orders) return 0;
  return countsAsSold(cart.orders.status) ? Number(cart.orders.total) || 0 : 0;
}

export type RecoverySummary = {
  /** Carts left in the period (abandoned at least once). */
  left: number;
  /** What those carts held when they were left, or last changed. */
  leftValue: number;
  /** Of those, the ones that came back and were ordered. */
  recovered: number;
  recoveredValue: number;
  /** recovered / left, as a whole percentage (0 when nothing was left). */
  rate: number;
  /** Open left carts a person can write to: consent and a WhatsApp number. */
  reachable: number;
  /** Open left carts whose shopper did not agree to hear about them, or left no number. */
  unreachable: number;
};

/** The screen's figures for the carts left in the last `days` days. */
export function recoverySummary(
  carts: readonly RecoveryCart[],
  now: Date,
  days = 30,
): RecoverySummary {
  const since = now.getTime() - days * 86_400_000;
  const inPeriod = carts.filter((cart) => {
    const left = cart.abandoned_at ? Date.parse(cart.abandoned_at) : NaN;
    return Number.isFinite(left) && left >= since && left <= now.getTime();
  });
  const recovered = inPeriod.filter((cart) => cart.status === "recovered");
  const open = inPeriod.filter(isLeftCart);
  const reachable = open.filter((cart) => cartChatUrl(cart) !== null).length;
  const round3 = (n: number) => Math.round(n * 1000) / 1000;
  return {
    left: inPeriod.length,
    leftValue: round3(inPeriod.reduce((sum, cart) => sum + (Number(cart.subtotal) || 0), 0)),
    recovered: recovered.length,
    recoveredValue: round3(recovered.reduce((sum, cart) => sum + recoveredValue(cart), 0)),
    rate: inPeriod.length ? Math.round((recovered.length / inPeriod.length) * 100) : 0,
    reachable,
    unreachable: open.length - reachable,
  };
}

export type RecoveryCode = { type: "percentage" | "fixed"; value: number; expiryHours: number };

/**
 * The code the store chose to offer with a reminder, or none. A code is made only when a person
 * asks for one on a cart; the screen once made a 10% code on every press, whatever the store set.
 */
export function storeRecoveryCode(
  settings:
    | {
        default_discount_type?: string | null;
        default_discount_value?: number | string | null;
        discount_expiry_hours?: number | string | null;
      }
    | null
    | undefined,
): RecoveryCode | null {
  const type = settings?.default_discount_type;
  const value = Number(settings?.default_discount_value);
  if ((type !== "percentage" && type !== "fixed") || !(value > 0)) return null;
  if (type === "percentage" && value > 100) return null;
  const hours = Number(settings?.discount_expiry_hours);
  return { type, value, expiryHours: hours > 0 ? Math.round(hours) : 48 };
}
