import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

/**
 * Gift cards sold online (step four, migration 20261104100000). The storefront reads the store's
 * offer (`storefront_gift_card_offer`); staff read what the store offers and the purchases, and
 * change them only through the database's functions (`set_gift_card_settings`,
 * `approve_gift_card_purchase`, `cancel_gift_card_purchase`).
 */

export type GiftCardOffer = {
  brandId: string;
  amounts: number[];
  /** The least and most a buyer may choose, in whole units (migration 20261206100000). */
  minAmount: number;
  maxAmount: number;
  currency: string;
  validMonths: number | null;
  card: boolean;
  benefit: boolean;
  /** The store prints the card and delivers it, for its own fee (migration 20261124100000). */
  print: boolean;
  printFee: number;
};

export function readOffer(raw: unknown): GiftCardOffer | null {
  if (!raw || typeof raw !== "object") return null;
  const offer = raw as Record<string, unknown>;
  const amounts = Array.isArray(offer.amounts)
    ? offer.amounts.map(Number).filter((n) => n > 0)
    : [];
  const range = offerRange(offer.min_amount, offer.max_amount, amounts);
  if (!range) return null;
  return {
    brandId: String(offer.brand_id ?? ""),
    amounts,
    minAmount: range.min,
    maxAmount: range.max,
    currency: String(offer.currency ?? "BHD"),
    validMonths: offer.valid_months == null ? null : Number(offer.valid_months),
    card: offer.card === true,
    benefit: offer.benefit === true,
    print: offer.print === true,
    printFee: Math.max(0, Number(offer.print_fee) || 0),
  };
}

/**
 * The store's range: its own least and most, else (a store not saved since the range) its list's
 * least and most in whole units, as the migration turned every list into a range.
 */
export function offerRange(
  min: unknown,
  max: unknown,
  amounts: readonly number[],
): { min: number; max: number } | null {
  const lo = Number(min);
  const hi = Number(max);
  if (
    min != null &&
    max != null &&
    Number.isFinite(lo) &&
    Number.isFinite(hi) &&
    lo >= 1 &&
    lo <= hi
  ) {
    return { min: lo, max: hi };
  }
  if (amounts.length === 0) return null;
  const least = Math.max(1, Math.ceil(Math.min(...amounts)));
  const most = Math.floor(Math.max(...amounts));
  return least <= most ? { min: least, max: most } : null;
}

export async function fetchGiftCardOffer(slug: string): Promise<GiftCardOffer | null> {
  const { data, error } = await supabase.rpc("storefront_gift_card_offer", { p_slug: slug });
  if (error) throw error;
  return readOffer(data);
}

export type GiftCardSettings = Tables<"gift_card_settings">;
export type GiftCardPurchase = Omit<Tables<"gift_card_purchases">, "token"> & {
  /** The card a paid purchase issued. */
  gift_cards?: {
    code: string;
    expires_on: string | null;
    balance?: number | null;
    status?: string | null;
    /** The card’s gift link token (`giftAddress`). */
    share_token?: string | null;
  } | null;
};

export const PURCHASE_SELECT =
  "id, brand_id, amount, currency, payment_method, status, buyer_name, buyer_phone, buyer_email, recipient_name, message, receipt_key, gift_card_id, created_at, paid_at, cancelled_at, cancel_reason, delivery_channel, lang, buyer_user_id, code_sent_at, code_sent_by, gateway_reference, design, print_by_store, print_fee, print_address, print_phone, printed_at, print_delivered_at, addons, addons_total, total_due, gift_cards(code, expires_on, balance, status, share_token)";

export async function fetchGiftCardSettings(brandId: string): Promise<GiftCardSettings | null> {
  const { data, error } = await supabase
    .from("gift_card_settings")
    .select(
      "brand_id, sell_online, amounts, min_amount, max_amount, valid_months, print_enabled, print_fee, updated_at, updated_by",
    )
    .eq("brand_id", brandId)
    .maybeSingle();
  if (error) throw error;
  return (data as GiftCardSettings | null) ?? null;
}

/** The store's latest purchases (the 200 newest: what staff act on is recent). */
export async function fetchGiftCardPurchases(brandId: string): Promise<GiftCardPurchase[]> {
  const { data, error } = await supabase
    .from("gift_card_purchases")
    .select(PURCHASE_SELECT)
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as unknown as GiftCardPurchase[];
}

/** A signed-in shopper's own cards in this store, with the code once paid (`storefront_my_gift_cards`). */
export type MyGiftCard = {
  id: string;
  created_at: string;
  amount: number;
  currency: string;
  status: string;
  payment_method: string;
  delivery_channel: string;
  recipient_name: string | null;
  code: string | null;
  balance: number | null;
  expires_on: string | null;
  card_status: string | null;
  /** The design the buyer chose (null before cards had designs). */
  design?: unknown;
};

export async function fetchMyGiftCards(brandId: string): Promise<MyGiftCard[]> {
  const { data, error } = await supabase.rpc("storefront_my_gift_cards", { p_brand_id: brandId });
  if (error) throw error;
  return (data ?? []) as MyGiftCard[];
}

export async function markGiftCardPurchaseSent(purchaseId: string) {
  const { error } = await supabase.rpc("mark_gift_card_purchase_sent", {
    p_purchase_id: purchaseId,
  });
  if (error) throw error;
}

export const giftCardOnlineKeys = {
  offer: (slug: string) => ["storefront", "gift-card-offer", slug] as const,
  settings: (brandId: string) => ["gift-cards", brandId, "online-settings"] as const,
  purchases: (brandId: string) => ["gift-cards", brandId, "purchases"] as const,
  mine: (brandId: string, userId: string) =>
    ["storefront", "my-gift-cards", brandId, userId] as const,
};

export const giftCardOnlineQueries = {
  offer: (slug: string) =>
    queryOptions({
      queryKey: giftCardOnlineKeys.offer(slug),
      queryFn: () => fetchGiftCardOffer(slug),
      enabled: Boolean(slug),
      staleTime: 5 * 60_000,
    }),
  settings: (brandId: string) =>
    queryOptions({
      queryKey: giftCardOnlineKeys.settings(brandId),
      queryFn: () => fetchGiftCardSettings(brandId),
      enabled: Boolean(brandId),
    }),
  mine: (brandId: string, userId: string | undefined) =>
    queryOptions({
      queryKey: giftCardOnlineKeys.mine(brandId, userId ?? ""),
      queryFn: () => fetchMyGiftCards(brandId),
      enabled: Boolean(brandId && userId),
    }),
  purchases: (brandId: string) =>
    queryOptions({
      queryKey: giftCardOnlineKeys.purchases(brandId),
      queryFn: () => fetchGiftCardPurchases(brandId),
      enabled: Boolean(brandId),
    }),
};

export async function saveGiftCardSettings(
  brandId: string,
  input: { sellOnline: boolean; minAmount: number; maxAmount: number; validMonths: number | null },
) {
  const { data, error } = await supabase.rpc("set_gift_card_settings", {
    p_brand_id: brandId,
    p_sell_online: input.sellOnline,
    // The range is the store's amounts now; the list is left empty.
    p_amounts: [],
    p_min_amount: input.minAmount,
    p_max_amount: input.maxAmount,
    ...(input.validMonths ? { p_valid_months: input.validMonths } : {}),
  });
  if (error) throw error;
  return data;
}

/** Whether the store prints cards bought online, and its fee for printing and delivering one. */
export async function saveGiftCardPrint(brandId: string, input: { enabled: boolean; fee: number }) {
  const { data, error } = await supabase.rpc("set_gift_card_print", {
    p_brand_id: brandId,
    p_enabled: input.enabled,
    p_fee: input.fee,
  });
  if (error) throw error;
  return data;
}

/** A card the store prints: on paper now, or delivered to its address (delivered is printed too). */
export async function setGiftCardPrintStep(purchaseId: string, step: "printed" | "delivered") {
  const { error } = await supabase.rpc("set_gift_card_print_step", {
    p_purchase_id: purchaseId,
    p_step: step,
  });
  if (error) throw error;
}

export async function approveGiftCardPurchase(purchaseId: string) {
  const { data, error } = await supabase.rpc("approve_gift_card_purchase", {
    p_purchase_id: purchaseId,
  });
  if (error) throw error;
  return data;
}

export async function cancelGiftCardPurchase(purchaseId: string, reason: string) {
  const { error } = await supabase.rpc("cancel_gift_card_purchase", {
    p_purchase_id: purchaseId,
    p_reason: reason,
  });
  if (error) throw error;
}

export function invalidateGiftCardOnline(qc: QueryClient, brandId: string) {
  return qc.invalidateQueries({ queryKey: ["gift-cards", brandId] });
}
