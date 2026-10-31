import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { allowTry, clientIp } from "@/lib/request-tries";

/**
 * A gift card at the storefront's checkout (step two of docs/gift-cards-plan.md). Both run as the
 * service role: a shopper may be a guest, and the database functions they call are the server's
 * alone. A code is tried at most a few times an hour from one address.
 *
 * - `checkGiftCard`: what a card holds in this store (balance, currency, expiry), for the
 *   checkout's preview. Nothing for a card that cannot pay (unknown, voided, expired, empty).
 * - `redeemGiftCardAtCheckout`: the card pays what it can of the order the shopper has just
 *   placed, proven by the order's confirmation token (as the card charge is). The database takes
 *   at most the balance and what is owed, once per order, before any other payment begins.
 */

const CODE = z.string().trim().min(4).max(32);

export type GiftCardPreview =
  | { found: true; balance: number; currency: string; expiresOn: string | null }
  | { found: false; limited: boolean };

export const checkGiftCard = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ slug: z.string().min(1).max(64), code: CODE }).parse(data),
  )
  .handler(async ({ data }): Promise<GiftCardPreview> => {
    if (!allowTry(`gift-card:${clientIp()}`, Date.now())) return { found: false, limited: true };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: reply, error } = await (
      supabaseAdmin.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>
    )("gift_card_balance_for_checkout", { p_slug: data.slug, p_code: data.code });
    if (error) {
      console.error("[checkGiftCard] lookup failed", error.message);
      return { found: false, limited: false };
    }
    const card = reply as {
      balance?: number;
      currency?: string;
      expires_on?: string | null;
    } | null;
    if (!card || !(Number(card.balance) > 0)) return { found: false, limited: false };
    return {
      found: true,
      balance: Number(card.balance),
      currency: String(card.currency ?? ""),
      expiresOn: card.expires_on ?? null,
    };
  });

export type CheckoutGiftCardResult =
  { applied: true; amount: number; owed: number } | { applied: false; reason: string };

export const redeemGiftCardAtCheckout = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        brandId: z.string().uuid(),
        confirmationToken: z.string().min(8).max(200),
        code: CODE,
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<CheckoutGiftCardResult> => {
    if (!allowTry(`gift-card:${clientIp()}`, Date.now())) {
      return { applied: false, reason: "GIFT_CARD_TRIES" };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order, error: orderError } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("id", data.orderId)
      .eq("brand_id", data.brandId)
      .eq("confirmation_email_token", data.confirmationToken)
      .maybeSingle();
    if (orderError || !order) return { applied: false, reason: "ORDER_NOT_FOUND" };

    const { data: reply, error } = await (
      supabaseAdmin.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>
    )("redeem_gift_card_at_checkout", { p_order_id: data.orderId, p_code: data.code });
    if (error) return { applied: false, reason: error.message };
    const taken = (reply ?? {}) as { amount?: number; owed?: number };
    return { applied: true, amount: Number(taken.amount ?? 0), owed: Number(taken.owed ?? 0) };
  });

/**
 * Whether the checkout offers a gift card field: only a store that holds a card a shopper could
 * still use (active, with a balance). A store that never issued one shows no field.
 */
export const storeTakesGiftCards = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ brandId: z.string().uuid() }).parse(data))
  .handler(async ({ data }): Promise<boolean> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("gift_cards")
      .select("id")
      .eq("brand_id", data.brandId)
      .eq("status", "active")
      .gt("balance", 0)
      .limit(1);
    if (error) return false;
    return (rows ?? []).length > 0;
  });
