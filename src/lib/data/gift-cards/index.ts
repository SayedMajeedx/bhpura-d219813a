import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { readAll } from "../read-all";

/**
 * A store's gift cards (migration 20261101100000). Staff read them; every change goes through
 * the database's own functions (`issue_gift_card`, `void_gift_card`, `redeem_gift_card_on_order`),
 * which keep each card's balance equal to the sum of its moves.
 */

export type GiftCard = Tables<"gift_cards">;
export type GiftCardMove = Tables<"gift_card_movements">;

export const GIFT_CARD_SELECT =
  "id, brand_id, code, currency, initial_amount, balance, expires_on, status, recipient_name, purchaser_name, note, source_order_id, issued_by, issued_at, voided_by, voided_at, void_reason, paid_with";
export const GIFT_CARD_MOVE_SELECT =
  "id, gift_card_id, brand_id, kind, amount, order_id, created_by, created_at, note";

/** Every card of the store, the newest first (read to the end: a store sells many at Eid). */
export async function fetchGiftCards(brandId: string): Promise<GiftCard[]> {
  const rows = await readAll((from, to) =>
    supabase
      .from("gift_cards")
      .select(GIFT_CARD_SELECT, { count: "exact" })
      .eq("brand_id", brandId)
      .order("issued_at", { ascending: false })
      .order("id")
      .range(from, to),
  );
  return rows as GiftCard[];
}

/** A card's moves, the oldest first. */
export async function fetchGiftCardMoves(brandId: string, cardId: string): Promise<GiftCardMove[]> {
  const { data, error } = await supabase
    .from("gift_card_movements")
    .select(GIFT_CARD_MOVE_SELECT)
    .eq("brand_id", brandId)
    .eq("gift_card_id", cardId)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as GiftCardMove[];
}

export const giftCardKeys = {
  all: (brandId: string) => ["gift-cards", brandId] as const,
  list: (brandId: string) => [...giftCardKeys.all(brandId), "list"] as const,
  moves: (brandId: string, cardId: string) =>
    [...giftCardKeys.all(brandId), "moves", cardId] as const,
};

export const giftCardQueries = {
  list: (brandId: string) =>
    queryOptions({
      queryKey: giftCardKeys.list(brandId),
      queryFn: () => fetchGiftCards(brandId),
      enabled: Boolean(brandId),
    }),
  moves: (brandId: string, cardId: string) =>
    queryOptions({
      queryKey: giftCardKeys.moves(brandId, cardId),
      queryFn: () => fetchGiftCardMoves(brandId, cardId),
      enabled: Boolean(brandId && cardId),
    }),
};

export function invalidateGiftCards(qc: QueryClient, brandId: string) {
  return qc.invalidateQueries({ queryKey: giftCardKeys.all(brandId) });
}

export type IssueGiftCard = {
  amount: number;
  recipientName?: string;
  purchaserName?: string;
  note?: string;
  expiresOn?: string | null;
  sourceOrderId?: string | null;
  /** How a card sold in the store was paid (migration 20261103100000); none for a card given. */
  paidWith?: "cash" | "card" | "transfer" | null;
};

export async function issueGiftCard(brandId: string, input: IssueGiftCard): Promise<GiftCard> {
  const { data, error } = await supabase.rpc("issue_gift_card", {
    p_brand_id: brandId,
    p_amount: input.amount,
    p_recipient_name: input.recipientName || undefined,
    p_purchaser_name: input.purchaserName || undefined,
    p_note: input.note || undefined,
    p_expires_on: input.expiresOn || undefined,
    p_source_order_id: input.sourceOrderId || undefined,
    p_paid_with: input.paidWith || undefined,
  });
  if (error) throw error;
  return data as GiftCard;
}

export async function voidGiftCard(cardId: string, reason: string): Promise<GiftCard> {
  const { data, error } = await supabase.rpc("void_gift_card", {
    p_card_id: cardId,
    p_reason: reason,
  });
  if (error) throw error;
  return data as GiftCard;
}

export type GiftCardRedemption = { amount: number; balance: number; owed: number };

/** A card taken as payment on an order (at most its balance and what is owed, or `amount`). */
export async function redeemGiftCardOnOrder(
  orderId: string,
  code: string,
  amount?: number | null,
): Promise<GiftCardRedemption> {
  const { data, error } = await supabase.rpc("redeem_gift_card_on_order", {
    p_order_id: orderId,
    p_code: code,
    ...(amount ? { p_amount: amount } : {}),
  });
  if (error) throw error;
  const reply = (data ?? {}) as Record<string, unknown>;
  return {
    amount: Number(reply.amount ?? 0),
    balance: Number(reply.balance ?? 0),
    owed: Number(reply.owed ?? 0),
  };
}
