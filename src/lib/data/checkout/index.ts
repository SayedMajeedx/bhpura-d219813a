import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";

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
 * With a booking (its services are in the cart), the order also finishes the
 * booking, in the same transaction (place_booking_order).
 */
export async function placeStorefrontOrder(
  input: StorefrontOrderInput,
  booking?: { id: string; token: string } | null,
) {
  // The generated overloads type optional arguments as `string | undefined`;
  // the function takes NULL for them (checked against the SQL signature).
  const { data, error } = booking
    ? await supabase.rpc("place_booking_order", {
        ...(input as PlaceStorefrontOrderArgs),
        p_booking_id: booking.id,
        p_hold_token: booking.token,
      })
    : await supabase.rpc("place_storefront_order", input as PlaceStorefrontOrderArgs);
  if (error) throw error;
  const result = data as { order_id?: string; confirmation_email_token?: string } | null;
  return {
    orderId: result?.order_id,
    confirmationToken: result?.confirmation_email_token ?? null,
  };
}

export const checkoutKeys = {
  whatsappUpdatesReady: (brandId: string) =>
    ["checkout", brandId, "whatsapp-updates-ready"] as const,
  pickupPartners: (brandId: string, items: readonly PickupCartItem[]) =>
    ["checkout", brandId, "pickup-partners", JSON.stringify(items)] as const,
};

export type PickupCartItem = {
  variant_id: string | null;
  quantity: number;
  made_to_order: boolean;
};

export type PickupPartner = {
  id: string;
  name: string;
  address_ar: string | null;
  address_en: string | null;
  location_url: string | null;
  notes_ar: string | null;
  notes_en: string | null;
};

export type PickupPartners = {
  partners: PickupPartner[];
  /** The store's own stock does not cover the cart: a branch pickup waits for pieces from a partner. */
  from_partner: boolean;
  /** The longest time those partners take to bring a piece to the branch, when the store wrote one. */
  transfer_days: number | null;
};

export const NO_PICKUP_PARTNERS: PickupPartners = {
  partners: [],
  from_partner: false,
  transfer_days: null,
};

/**
 * Where else this cart can be collected: the store's partners that take pickups and hold every
 * piece, and whether a pickup at the store's branch waits for pieces from a partner. The
 * database answers without telling a visitor any quantity. A failed read offers no partner.
 */
export async function fetchPickupPartners(
  brandId: string,
  items: readonly PickupCartItem[],
): Promise<PickupPartners> {
  const { data, error } = await supabase.rpc("storefront_pickup_partners", {
    p_brand_id: brandId,
    p_items: items as unknown as Json,
  });
  if (error || !data || typeof data !== "object") return NO_PICKUP_PARTNERS;
  const value = data as Partial<PickupPartners>;
  return {
    partners: Array.isArray(value.partners) ? value.partners : [],
    from_partner: value.from_partner === true,
    transfer_days: typeof value.transfer_days === "number" ? value.transfer_days : null,
  };
}

/**
 * Whether the store can send WhatsApp order updates now (its own connection is on, with a number
 * and an active message). The checkout offers the opt-in only then: a box that promises messages
 * nothing will send is worse than no box. A failed read offers nothing.
 */
export async function fetchWhatsappUpdatesReady(brandId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("storefront_whatsapp_updates_ready", {
    p_brand_id: brandId,
  });
  return !error && data === true;
}

export const checkoutQueries = {
  pickupPartners: (brandId: string, items: readonly PickupCartItem[]) =>
    queryOptions({
      queryKey: checkoutKeys.pickupPartners(brandId, items),
      queryFn: () => fetchPickupPartners(brandId, items),
      enabled: Boolean(brandId) && items.length > 0,
      staleTime: 30_000,
    }),
  whatsappUpdatesReady: (brandId: string) =>
    queryOptions({
      queryKey: checkoutKeys.whatsappUpdatesReady(brandId),
      queryFn: () => fetchWhatsappUpdatesReady(brandId),
      staleTime: 5 * 60_000,
    }),
};

/**
 * Records that the shopper wants WhatsApp order updates. Returns whether it was recorded (the
 * database records it only for a store that can send them).
 */
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
