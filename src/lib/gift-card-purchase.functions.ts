import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { allowTry, clientIp } from "@/lib/request-tries";

/**
 * A shopper buying a gift card on the storefront (step four of docs/gift-cards-plan.md). Both run
 * as the service role: the shopper may be a guest, and the database functions are the server's.
 *
 * - `startGiftCardPurchase`: writes the purchase (`create_gift_card_purchase`: one of the store's
 *   amounts, a method it takes, a transfer's receipt used once), a few times an hour per address.
 *   Answers the purchase and its token; a card payment then goes to `/api/public/gift-cards/charge`.
 * - `getGiftCardPurchase`: the purchase's own page, by its id and token: its state, and the card's
 *   code once it is paid. A wrong token reads as no purchase.
 */

type Rpc = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

const START = z.object({
  slug: z.string().min(1).max(64),
  amount: z.number().positive().max(100_000),
  method: z.enum(["card", "benefit"]),
  buyer: z.object({
    name: z.string().trim().min(1).max(120),
    phone: z.string().trim().max(32).optional(),
    email: z.string().trim().max(200).optional(),
    recipient: z.string().trim().max(120).optional(),
    message: z.string().trim().max(300).optional(),
    /** How the code reaches the buyer: WhatsApp needs the phone, email the email. */
    delivery: z.enum(["whatsapp", "email"]),
    lang: z.enum(["ar", "en"]),
    /** The card's design (the database cleans it and keeps one of the store's own photos only). */
    design: z
      .object({
        occasion: z.string().max(32),
        design: z.string().max(32),
        orientation: z.enum(["portrait", "landscape"]),
        language: z.enum(["ar", "en", "both"]),
        from: z.string().trim().max(80).nullable().optional(),
        photo: z.string().max(1000).nullable().optional(),
        print: z.boolean().optional(),
      })
      .optional(),
  }),
  receiptId: z.string().uuid().nullable().optional(),
  /** The shopper's session when signed in: the purchase is then theirs in their account. */
  accessToken: z.string().max(4000).optional(),
});

/** The signed-in shopper, from their own session (checked here, never taken from the browser). */
async function sessionUser(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.auth.getUser(token);
  return data?.user?.id ?? null;
}

export type StartedPurchase =
  { ok: true; id: string; token: string; brandId: string } | { ok: false; reason: string };

export const startGiftCardPurchase = createServerFn({ method: "POST" })
  .validator((data: unknown) => START.parse(data))
  .handler(async ({ data }): Promise<StartedPurchase> => {
    if (!allowTry(`gift-card-buy:${clientIp()}`, Date.now())) {
      return { ok: false, reason: "GIFT_CARD_TRIES" };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: reply, error } = await (supabaseAdmin.rpc as unknown as Rpc)(
      "create_gift_card_purchase",
      {
        p_slug: data.slug,
        p_amount: data.amount,
        p_method: data.method,
        p_buyer: data.buyer,
        p_receipt_id: data.receiptId ?? null,
        p_user_id: await sessionUser(data.accessToken),
      },
    );
    if (error) return { ok: false, reason: error.message };
    const made = (reply ?? {}) as { id?: string; token?: string; brand_id?: string };
    if (!made.id || !made.token || !made.brand_id) return { ok: false, reason: "PURCHASE_FAILED" };
    // A transfer is told at once: the buyer that it was received, the store that it waits.
    if (data.method === "benefit") {
      const { sendGiftCardNoticesNow } = await import("@/lib/gift-card-notices.server");
      await sendGiftCardNoticesNow();
    }
    return { ok: true, id: made.id, token: made.token, brandId: made.brand_id };
  });

export type PurchaseView = {
  status: "pending" | "paid" | "cancelled" | "expired";
  method: "card" | "benefit";
  amount: number;
  currency: string;
  recipientName: string | null;
  message: string | null;
  brandId: string;
  delivery: "whatsapp" | "email";
  /** Where the code goes: the buyer's email or phone. */
  deliveryTo: string | null;
  /** Only once paid. */
  code: string | null;
  expiresOn: string | null;
  /** The design the buyer chose (null for a purchase made before cards had designs). */
  design: StoredCardDesign | null;
};

/** A card's design as the database keeps it (read with `readDesign`). */
export type StoredCardDesign = {
  occasion?: string;
  design?: string;
  orientation?: string;
  language?: string;
  from?: string | null;
  photo?: string | null;
  print?: boolean;
};

export const getGiftCardPurchase = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ purchaseId: z.string().uuid(), token: z.string().min(32).max(80) }).parse(data),
  )
  .handler(async ({ data }): Promise<PurchaseView | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("gift_card_purchases")
      .select(
        "status, payment_method, amount, currency, recipient_name, message, brand_id, delivery_channel, buyer_email, buyer_phone, design, gift_cards(code, expires_on)",
      )
      .eq("id", data.purchaseId)
      .eq("token", data.token)
      .maybeSingle();
    if (error || !row) return null;
    const purchase = row as unknown as {
      status: PurchaseView["status"];
      payment_method: PurchaseView["method"];
      amount: number;
      currency: string;
      recipient_name: string | null;
      message: string | null;
      brand_id: string;
      delivery_channel: "whatsapp" | "email";
      buyer_email: string | null;
      buyer_phone: string | null;
      design: StoredCardDesign | null;
      gift_cards: { code: string; expires_on: string | null } | null;
    };
    const paid = purchase.status === "paid";
    return {
      status: purchase.status,
      method: purchase.payment_method,
      amount: Number(purchase.amount),
      currency: purchase.currency,
      recipientName: purchase.recipient_name,
      message: purchase.message,
      brandId: purchase.brand_id,
      delivery: purchase.delivery_channel ?? "whatsapp",
      deliveryTo:
        purchase.delivery_channel === "email" ? purchase.buyer_email : purchase.buyer_phone,
      code: paid ? (purchase.gift_cards?.code ?? null) : null,
      expiresOn: paid ? (purchase.gift_cards?.expires_on ?? null) : null,
      design: purchase.design ?? null,
    };
  });

/**
 * The transfer receipt of a purchase, for the store's staff who handle orders: a short-lived link
 * to the private file. The purchase is read with the caller's own rights, so another store's
 * purchase is not found.
 */
export const getGiftCardPurchaseReceiptUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ purchaseId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("gift_card_purchases")
      .select("brand_id, receipt_key")
      .eq("id", data.purchaseId)
      .maybeSingle();
    const purchase = row as { brand_id: string; receipt_key: string | null } | null;
    if (error || !purchase?.receipt_key) throw new Error("RECEIPT_NOT_FOUND");
    const { data: allowed } = await context.supabase.rpc("has_permission", {
      p_permission: "manage_orders",
    });
    if (!allowed) throw new Error("FORBIDDEN");
    const { createPrivateViewUrl, isPrivateReceiptKey } = await import("@/lib/private-r2.server");
    if (!isPrivateReceiptKey(purchase.receipt_key, purchase.brand_id)) {
      throw new Error("INVALID_RECEIPT_KEY");
    }
    return { url: await createPrivateViewUrl(purchase.receipt_key), expiresInSeconds: 300 };
  });
