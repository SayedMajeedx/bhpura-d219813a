import { supabase } from "@/integrations/supabase/client";
import type { CartLineSnapshot } from "./abandoned-carts.types";

/**
 * Sync active cart state with backend for abandoned cart tracking
 */
export async function syncStorefrontCartActivity({
  brandId,
  sessionId,
  customerId,
  guestEmail,
  guestPhone,
  guestName,
  cartItems,
  subtotal,
  currency = "BHD",
  marketingConsent = true,
}: {
  brandId: string;
  sessionId: string;
  customerId?: string | null;
  guestEmail?: string | null;
  guestPhone?: string | null;
  guestName?: string | null;
  cartItems: CartLineSnapshot[];
  subtotal: number;
  currency?: string;
  marketingConsent?: boolean;
}) {
  try {
    if (cartItems.length === 0) {
      const { data, error } = await (supabase.rpc as any)("rpc_close_storefront_cart_session", {
        p_brand_id: brandId,
        p_session_id: sessionId,
      });
      if (error) {
        console.warn("Non-fatal cart close warning:", error.message);
        return null;
      }
      return data;
    }

    const { data, error } = await (supabase.rpc as any)("rpc_record_or_update_cart_activity", {
      p_brand_id: brandId,
      p_session_id: sessionId,
      p_customer_id: customerId ?? null,
      p_guest_email: guestEmail ?? null,
      p_guest_phone: guestPhone ?? null,
      p_guest_name: guestName ?? null,
      p_cart_items: cartItems,
      p_subtotal: subtotal,
      p_currency: currency,
      p_marketing_consent: marketingConsent,
    });

    if (error) {
      console.warn("Non-fatal cart activity sync warning:", error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.warn("Silently captured cart sync error:", err);
    return null;
  }
}

/**
 * Validate and restore abandoned cart from recovery token
 */
export async function restoreAbandonedCart({
  brandSlug,
  recoveryToken,
}: {
  brandSlug: string;
  recoveryToken: string;
}) {
  const { data, error } = await (supabase.rpc as any)("rpc_validate_and_restore_abandoned_cart", {
    p_brand_slug: brandSlug,
    p_recovery_token: recoveryToken,
  });

  if (error) throw error;
  return data;
}

/**
 * Generate a dynamic single-use recovery coupon for an abandoned cart
 */
export async function generateCartRecoveryCoupon({
  brandId,
  cartId,
  discountType = "percentage",
  discountValue = 10,
  expiryHours = 48,
}: {
  brandId: string;
  cartId: string;
  discountType?: "percentage" | "fixed";
  discountValue?: number;
  expiryHours?: number;
}) {
  const { data, error } = await (supabase.rpc as any)("rpc_generate_abandoned_cart_recovery_coupon", {
    p_brand_id: brandId,
    p_cart_id: cartId,
    p_discount_type: discountType,
    p_discount_value: discountValue,
    p_expiry_hours: expiryHours,
  });

  if (error) throw error;
  return data as string;
}

/**
 * Mark cart recovered immediately on order placement
 */
export async function markCartRecoveredOnOrder({
  brandId,
  orderId,
  customerId,
  sessionId,
  guestEmail,
  guestPhone,
}: {
  brandId: string;
  orderId: string;
  customerId?: string | null;
  sessionId?: string | null;
  guestEmail?: string | null;
  guestPhone?: string | null;
}) {
  try {
    const { data, error } = await (supabase.rpc as any)("rpc_mark_cart_recovered_on_order", {
      p_brand_id: brandId,
      p_order_id: orderId,
      p_customer_id: customerId ?? null,
      p_session_id: sessionId ?? null,
      p_guest_email: guestEmail ?? null,
      p_guest_phone: guestPhone ?? null,
    });
    if (error) {
      console.warn("Non-fatal cart recovery mark error:", error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.warn("Silently captured mark cart recovered error:", err);
    return null;
  }
}
