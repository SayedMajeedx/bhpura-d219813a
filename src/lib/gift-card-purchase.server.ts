import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  judgeGiftCardCharge,
  type ChargeVerdict,
  type GiftCardCharge,
} from "@/lib/payments/gift-card-charge";

/**
 * A gift card purchase's card payment, checked with Tap and settled (server only, with the
 * service-role client): read the charge from Tap itself, judge it against the purchase
 * (`judgeGiftCardCharge`) and, when it was captured, issue the card once
 * (`settle_gift_card_purchase`). The redirect and the webhook both come here, so a card is
 * issued once whichever arrives first.
 */

type Admin = SupabaseClient<Database>;
type Rpc = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

export type PurchaseRow = {
  id: string;
  brand_id: string;
  amount: number;
  currency: string;
  status: string;
  payment_method: string;
  gateway_reference: string | null;
  token: string;
};

export const PURCHASE_COLUMNS =
  "id, brand_id, amount, currency, status, payment_method, gateway_reference, token";

export async function tapKey(admin: Admin, brandId: string): Promise<string | null> {
  const { data, error } = await (admin.rpc as unknown as Rpc)("get_integration_credential_secret", {
    p_brand_id: brandId,
    p_provider: "tap",
  });
  const credential = Array.isArray(data)
    ? (data[0] as { api_key?: string } | undefined)
    : undefined;
  return error || !credential?.api_key ? null : credential.api_key;
}

export async function readPurchase(admin: Admin, id: string, brandId: string) {
  const { data, error } = await admin
    .from("gift_card_purchases")
    .select(PURCHASE_COLUMNS)
    .eq("id", id)
    .eq("brand_id", brandId)
    .maybeSingle();
  if (error) throw new Error(`PURCHASE_LOOKUP_FAILED: ${error.message}`);
  return (data as unknown as PurchaseRow | null) ?? null;
}

export type ChargeablePurchase = PurchaseRow & {
  buyer_name: string;
  buyer_phone: string;
  buyer_email: string | null;
};

/** A purchase as the charge route sees it: by its id, its store and the buyer's token. */
export async function readPurchaseForCharge(
  admin: Admin,
  input: { purchaseId: string; brandId: string; token: string },
): Promise<ChargeablePurchase | null> {
  const { data, error } = await admin
    .from("gift_card_purchases")
    .select(`${PURCHASE_COLUMNS}, buyer_name, buyer_phone, buyer_email`)
    .eq("id", input.purchaseId)
    .eq("brand_id", input.brandId)
    .eq("token", input.token)
    .maybeSingle();
  if (error) return null;
  return (data as unknown as ChargeablePurchase | null) ?? null;
}

/** Keeps the charge on its purchase, only if none was kept before (two tabs never both win). */
export async function keepChargeReference(
  admin: Admin,
  input: { purchaseId: string; brandId: string; chargeId: string },
): Promise<boolean> {
  const { data, error } = await admin
    .from("gift_card_purchases")
    .update({ gateway_reference: input.chargeId })
    .eq("id", input.purchaseId)
    .eq("brand_id", input.brandId)
    .is("gateway_reference", null)
    .select("gateway_reference")
    .maybeSingle();
  return !error && Boolean(data);
}

export async function storeSlug(admin: Admin, brandId: string): Promise<string | null> {
  const { data } = await admin.from("brands").select("slug").eq("id", brandId).maybeSingle();
  return (data as { slug?: string } | null)?.slug ?? null;
}

/** Checks a charge with Tap and settles its purchase when it was captured. */
export async function settleGiftCardCharge(
  admin: Admin,
  input: { purchaseId: string; brandId: string; chargeId: string },
): Promise<{ verdict: ChargeVerdict; purchase: PurchaseRow | null }> {
  const purchase = await readPurchase(admin, input.purchaseId, input.brandId);
  if (
    !purchase ||
    purchase.payment_method !== "card" ||
    purchase.gateway_reference !== input.chargeId
  ) {
    return { verdict: "mismatch", purchase };
  }
  const key = await tapKey(admin, input.brandId);
  if (!key) throw new Error("TAP_NOT_CONFIGURED");
  const response = await fetch(
    `https://api.tap.company/v2/charges/${encodeURIComponent(input.chargeId)}`,
    { headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" } },
  );
  if (!response.ok) throw new Error(`TAP_LOOKUP_FAILED: ${response.status}`);
  const charge = (await response.json()) as GiftCardCharge;
  const verdict = judgeGiftCardCharge(charge, {
    id: purchase.id,
    brandId: purchase.brand_id,
    amount: Number(purchase.amount),
    currency: purchase.currency,
  });
  if (verdict === "paid" && purchase.status !== "paid") {
    const { error } = await (admin.rpc as unknown as Rpc)("settle_gift_card_purchase", {
      p_purchase_id: purchase.id,
      p_reference: input.chargeId,
    });
    if (error) throw new Error(`PURCHASE_SETTLE_FAILED: ${error.message}`);
  }
  return { verdict, purchase };
}
