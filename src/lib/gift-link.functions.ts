import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { allowTry, clientIp } from "@/lib/request-tries";
import { giftState, type GiftView } from "@/lib/gift-link";
import type { StoredCardDesign } from "@/lib/gift-card-purchase.functions";

/**
 * A gift card's own page, for the person it was given to (`/<store>/gift/<token>`). Anyone holding
 * the link may call these, so each answers only what the link is for, as the service role:
 *
 * - `getGift`: the card's words and design. Never its code, how it was paid or who bought it.
 * - `openGiftCode`: the code, asked for on a tap (so it is in no page a chat's preview reads),
 *   only while the card can still be used, a few times an hour per address.
 * - `resetGiftLink`: the buyer, proved by their purchase's own token, gives the card a new link
 *   when the first went to the wrong person; the old link stops answering.
 */

const LINK = z.object({
  slug: z.string().min(1).max(64),
  token: z.string().regex(/^[a-f0-9]{64}$/),
});

type CardRow = {
  id: string;
  brand_id: string;
  code: string;
  currency: string;
  initial_amount: number;
  balance: number;
  expires_on: string | null;
  status: string;
  recipient_name: string | null;
  purchaser_name: string | null;
  gift_card_purchases:
    | {
        recipient_name: string | null;
        message: string | null;
        design: StoredCardDesign | null;
        lang: string | null;
      }[]
    | null;
};

const CARD_SELECT =
  "id, brand_id, code, currency, initial_amount, balance, expires_on, status, recipient_name, purchaser_name, gift_card_purchases(recipient_name, message, design, lang)";

/** The card a link names, in the store the link is on; null for anything else. */
async function cardOfLink(link: z.infer<typeof LINK>): Promise<CardRow | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: brand }, { data: card }] = await Promise.all([
    supabaseAdmin.from("brands").select("id").eq("slug", link.slug).maybeSingle(),
    supabaseAdmin
      .from("gift_cards")
      .select(CARD_SELECT)
      .eq("share_token", link.token)
      .maybeSingle(),
  ]);
  const found = card as unknown as CardRow | null;
  if (!brand || !found || found.brand_id !== (brand as { id: string }).id) return null;
  return found;
}

const today = () => new Date().toISOString().slice(0, 10);

export const getGift = createServerFn({ method: "POST" })
  .validator((data: unknown) => LINK.parse(data))
  .handler(async ({ data }): Promise<GiftView | null> => {
    const card = await cardOfLink(data);
    if (!card) return null;
    const purchase = card.gift_card_purchases?.[0] ?? null;
    const from = purchase
      ? // A card bought on the store names its giver only when they wrote it on the card.
        (typeof purchase.design?.from === "string" && purchase.design.from.trim()) || null
      : card.purchaser_name?.trim() || null;
    return {
      brandId: card.brand_id,
      state: giftState(card, today()),
      amount: Number(card.initial_amount),
      balance: Number(card.balance),
      currency: card.currency,
      to: purchase?.recipient_name?.trim() || card.recipient_name?.trim() || null,
      message: purchase?.message?.trim() || null,
      from,
      expiresOn: card.expires_on,
      design: purchase?.design ?? null,
      lang: purchase?.lang === "en" ? "en" : purchase?.lang === "ar" ? "ar" : null,
    };
  });

export type OpenedGift = { ok: true; code: string } | { ok: false; reason: "tries" | "closed" };

export const openGiftCode = createServerFn({ method: "POST" })
  .validator((data: unknown) => LINK.parse(data))
  .handler(async ({ data }): Promise<OpenedGift> => {
    if (!allowTry(`gift-open:${clientIp()}`, Date.now(), 30)) return { ok: false, reason: "tries" };
    const card = await cardOfLink(data);
    if (!card || giftState(card, today()) !== "ready") return { ok: false, reason: "closed" };
    return { ok: true, code: card.code };
  });

const newToken = () =>
  `${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "")}`;

export const resetGiftLink = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ purchaseId: z.string().uuid(), token: z.string().min(32).max(80) }).parse(data),
  )
  .handler(async ({ data }): Promise<{ giftToken: string } | null> => {
    if (!allowTry(`gift-relink:${clientIp()}`, Date.now())) return null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("gift_card_purchases")
      .select("status, gift_card_id")
      .eq("id", data.purchaseId)
      .eq("token", data.token)
      .maybeSingle();
    const purchase = row as { status: string; gift_card_id: string | null } | null;
    if (!purchase || purchase.status !== "paid" || !purchase.gift_card_id) return null;
    const giftToken = newToken();
    const { error } = await supabaseAdmin
      .from("gift_cards")
      .update({ share_token: giftToken })
      .eq("id", purchase.gift_card_id);
    return error ? null : { giftToken };
  });
