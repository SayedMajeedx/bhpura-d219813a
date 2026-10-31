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
  currency: string;
  validMonths: number | null;
  card: boolean;
  benefit: boolean;
};

export function readOffer(raw: unknown): GiftCardOffer | null {
  if (!raw || typeof raw !== "object") return null;
  const offer = raw as Record<string, unknown>;
  const amounts = Array.isArray(offer.amounts)
    ? offer.amounts.map(Number).filter((n) => n > 0)
    : [];
  if (amounts.length === 0) return null;
  return {
    brandId: String(offer.brand_id ?? ""),
    amounts,
    currency: String(offer.currency ?? "BHD"),
    validMonths: offer.valid_months == null ? null : Number(offer.valid_months),
    card: offer.card === true,
    benefit: offer.benefit === true,
  };
}

export async function fetchGiftCardOffer(slug: string): Promise<GiftCardOffer | null> {
  const { data, error } = await supabase.rpc("storefront_gift_card_offer", { p_slug: slug });
  if (error) throw error;
  return readOffer(data);
}

export type GiftCardSettings = Tables<"gift_card_settings">;
export type GiftCardPurchase = Omit<Tables<"gift_card_purchases">, "token"> & {
  /** The card a paid purchase issued. */
  gift_cards?: { code: string; expires_on: string | null } | null;
};

export const PURCHASE_SELECT =
  "id, brand_id, amount, currency, payment_method, status, buyer_name, buyer_phone, buyer_email, recipient_name, message, receipt_key, gift_card_id, created_at, paid_at, cancelled_at, cancel_reason, delivery_channel, lang, buyer_user_id, code_sent_at, code_sent_by, gift_cards(code, expires_on)";

export async function fetchGiftCardSettings(brandId: string): Promise<GiftCardSettings | null> {
  const { data, error } = await supabase
    .from("gift_card_settings")
    .select("brand_id, sell_online, amounts, valid_months, updated_at, updated_by")
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
  input: { sellOnline: boolean; amounts: number[]; validMonths: number | null },
) {
  const { data, error } = await supabase.rpc("set_gift_card_settings", {
    p_brand_id: brandId,
    p_sell_online: input.sellOnline,
    p_amounts: input.amounts,
    ...(input.validMonths ? { p_valid_months: input.validMonths } : {}),
  });
  if (error) throw error;
  return data;
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
