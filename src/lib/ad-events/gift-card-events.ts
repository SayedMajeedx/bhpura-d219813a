import type { AdEvent, Visit } from "./shared";
import { purchaseEventId } from "./shared";

/**
 * A gift card bought on the storefront, told to the store's ad platforms (Meta, TikTok, Snapchat)
 * as the storefront's other purchases are: the pixel in the browser and the server under the same
 * event id, so each platform counts it once. A card purchase is a purchase of its own, never an
 * order (`gift_card_purchases`), so before this no ad platform ever heard of one, and a campaign
 * for gift cards could not learn who buys them (2026-11-09). Pure: the server reads the row and
 * sends what `giftCardPurchaseEvent` makes of it; the page sends what `giftCardPixelPayload` says.
 */

/** The one "product" a card purchase is, in every platform's content ids. */
export const GIFT_CARD_CONTENT_ID = "gift-card";

/** A purchase is sent while it is fresh, as an order is (`receiptOpen`: six hours). */
export const GIFT_CARD_EVENT_WINDOW_MS = 6 * 60 * 60 * 1000;

export type GiftCardPurchaseRow = {
  id: string;
  brand_id: string;
  created_at: string | null;
  status: string | null;
  currency: string | null;
  amount: number | null;
  total_due: number | null;
  buyer_name: string | null;
  buyer_email: string | null;
  buyer_phone: string | null;
};

/** What the buyer pays: the card's value and, for a card the store prints, its fee. */
export function giftCardPurchaseTotal(row: Pick<GiftCardPurchaseRow, "amount" | "total_due">) {
  const total = Number(row.total_due ?? row.amount ?? 0);
  return Number.isFinite(total) && total > 0 ? Number(total.toFixed(3)) : 0;
}

/** Sent only for a purchase written in the last six hours and not cancelled. */
export function giftCardPurchaseFresh(
  row: Pick<GiftCardPurchaseRow, "created_at" | "status">,
  now: number,
): boolean {
  if (row.status === "cancelled") return false;
  const at = row.created_at ? Date.parse(row.created_at) : NaN;
  return Number.isFinite(at) && now - at >= -60_000 && now - at <= GIFT_CARD_EVENT_WINDOW_MS;
}

/** The purchase as every platform's server API is told it, or nothing for a stale or empty one. */
export function giftCardPurchaseEvent(
  row: GiftCardPurchaseRow,
  input: { now: number; visit: Visit; pageUrl?: string | null; storeCurrency?: string | null },
): AdEvent | null {
  const total = giftCardPurchaseTotal(row);
  if (!total || !giftCardPurchaseFresh(row, input.now)) return null;
  return {
    event: "purchase",
    eventId: purchaseEventId(row.id),
    now: input.now,
    pageUrl: input.pageUrl,
    shopper: { email: row.buyer_email, phone: row.buyer_phone, name: row.buyer_name },
    visit: input.visit,
    order: {
      id: row.id,
      currency: row.currency || input.storeCurrency || "BHD",
      total,
      lines: [{ productId: GIFT_CARD_CONTENT_ID, quantity: 1, lineTotal: total }],
    },
  };
}

/**
 * What the page tells the pixels (and the store's own analytics), as checkout describes an order:
 * `gift_card_purchase_id` is how the store's server knows to read the card purchase, not an order.
 */
export function giftCardPixelPayload(input: {
  purchaseId?: string | null;
  currency: string;
  value: number;
}): Record<string, unknown> {
  const value =
    Number.isFinite(input.value) && input.value > 0 ? Number(input.value.toFixed(3)) : 0;
  return {
    ...(input.purchaseId
      ? { transaction_id: input.purchaseId, gift_card_purchase_id: input.purchaseId }
      : {}),
    currency: input.currency,
    value,
    items: [{ item_id: GIFT_CARD_CONTENT_ID, item_name: "Gift card", price: value, quantity: 1 }],
  };
}
