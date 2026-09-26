import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

/**
 * The storefront checkout's database calls: placing the order, recording the
 * shopper's WhatsApp order-update consent, and asking whether an email or
 * phone already has an account (to offer sign-in). The order's arguments are
 * built by `placeStorefrontOrderArgs` in `@/features/checkout/lib/place-order`.
 */

/** The newest `place_storefront_order` overload (shipping and idempotency). */
type PlaceStorefrontOrderArgs = Extract<
  Database["public"]["Functions"]["place_storefront_order"],
  { Args: { p_idempotency_key?: string } }
>["Args"];

/** What the order builder produces: the newest overload, with NULL for unused options. */
export type StorefrontOrderInput = {
  [K in keyof PlaceStorefrontOrderArgs]?: PlaceStorefrontOrderArgs[K] | null;
} & Pick<PlaceStorefrontOrderArgs, "p_brand_slug" | "p_payment_method">;

/**
 * Places the order and returns its id and the confirmation token (used to
 * record consent and open the thank-you page). Throws the database error.
 */
export async function placeStorefrontOrder(input: StorefrontOrderInput) {
  // The generated overloads type optional arguments as `string | undefined`;
  // the function takes NULL for them (checked against the SQL signature).
  const { data, error } = await supabase.rpc(
    "place_storefront_order",
    input as PlaceStorefrontOrderArgs,
  );
  if (error) throw error;
  const result = data as { order_id?: string; confirmation_email_token?: string } | null;
  return {
    orderId: result?.order_id,
    confirmationToken: result?.confirmation_email_token ?? null,
  };
}

/** Records that the shopper wants WhatsApp order updates. Returns whether it was recorded. */
export async function recordOrderWhatsappOptIn(orderId: string, confirmationToken: string) {
  const { error } = await supabase.rpc("record_order_whatsapp_opt_in", {
    p_order_id: orderId,
    p_confirmation_token: confirmationToken,
  });
  return !error;
}

/** Whether a customer account of the brand already uses this email or phone. Throws on error. */
export async function isRegisteredCustomer(
  brandId: string,
  contact: { email?: string; phone?: string },
) {
  const { data, error } = await supabase.rpc("check_registered_customer_exists", {
    p_brand_id: brandId,
    p_email: contact.email ?? "",
    p_phone: contact.phone ?? "",
  });
  if (error) throw error;
  return data === true;
}
