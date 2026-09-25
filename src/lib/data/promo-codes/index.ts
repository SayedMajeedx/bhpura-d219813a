import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

/**
 * A brand's promo codes: the Discounts page's list and writes, and the
 * validation checkout and the order editor run before applying a code.
 */

export const promoCodesKeys = {
  all: (brandId: string) => ["promo-codes", brandId] as const,
  /** The Discounts page's list (arrays only, so it can be updated in place). */
  list: (brandId: string) => [...promoCodesKeys.all(brandId), "list"] as const,
};

/** The brand's promo codes, newest first. */
export async function fetchPromoCodes(brandId: string) {
  const { data, error } = await supabase
    .from("promo_codes")
    .select(
      "id,brand_id,code,discount_type,discount_value,minimum_order_amount,maximum_discount_amount,first_time_customers_only,returning_customers_only,exclude_sale_items,usage_limit_per_customer,is_active,created_at,exclude_low_margin,margin_threshold,start_date,end_date,max_redemptions",
    )
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
export type PromoCodeRow = Awaited<ReturnType<typeof fetchPromoCodes>>[number];

export const promoCodesQueries = {
  list: (brandId: string) =>
    queryOptions({
      queryKey: promoCodesKeys.list(brandId),
      queryFn: () => fetchPromoCodes(brandId),
      enabled: Boolean(brandId),
    }),
};

// ── Writes ──────────────────────────────────────────────────────────────────

export type NewPromoCode = TablesInsert<"promo_codes">;
export type PromoCodePatch = TablesUpdate<"promo_codes">;

/** The brand's promo code lists are stale after a write. */
export function invalidatePromoCodes(qc: QueryClient, brandId: string) {
  return qc.invalidateQueries({ queryKey: promoCodesKeys.all(brandId) });
}

/** Creates a code for the brand. A duplicate code fails with Postgres code 23505. */
export async function createPromoCode(brandId: string, values: NewPromoCode) {
  const { error } = await supabase.from("promo_codes").insert({ ...values, brand_id: brandId });
  if (error) throw error;
}

/** Changes one code of the brand. A duplicate code fails with Postgres code 23505. */
export async function updatePromoCode(brandId: string, promoId: string, patch: PromoCodePatch) {
  const { error } = await supabase
    .from("promo_codes")
    .update(patch)
    .eq("id", promoId)
    .eq("brand_id", brandId);
  if (error) throw error;
}

export async function deletePromoCode(brandId: string, promoId: string) {
  const { error } = await supabase
    .from("promo_codes")
    .delete()
    .eq("id", promoId)
    .eq("brand_id", brandId);
  if (error) throw error;
}

/** What `validate_promo_code` answers: valid with the discount, or the reason it is not. */
export type PromoValidation =
  | { valid: true; code: string; discount_amount: number | string; [key: string]: unknown }
  | { valid?: false; reason?: string; [key: string]: unknown };

/**
 * Checks a code against a basket on the server (dates, limits, first-time or
 * returning customers, sale and low-margin exclusions) and returns the
 * discount it would give. Throws when the check itself fails.
 */
export async function validatePromoCode(args: {
  brandSlug: string;
  code: string;
  subtotal: number;
  items: Array<{ variant_id?: string | null; line_total: number }>;
  customerId?: string | null;
}): Promise<PromoValidation | null> {
  const { data, error } = await supabase.rpc("validate_promo_code", {
    p_brand_slug: args.brandSlug,
    p_code: args.code,
    p_subtotal: args.subtotal,
    p_items: args.items as unknown as Json,
    // The function defaults a missing customer to null.
    p_customer_id: args.customerId ?? undefined,
  });
  if (error) throw error;
  return data as PromoValidation | null;
}
