import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import type { OffersOutcome, StoreOffer } from "@/lib/offers";

/**
 * A store's automatic offers (store_offers; migration 20261027100000): the Discounts page's list
 * and writes (staff who may change settings), the store's combining rule, and what the
 * storefront reads: the live offers' terms and, at checkout, what a cart would get. The order
 * builder applies the same rule to every storefront order.
 */

export const offersKeys = {
  all: (brandId: string) => ["store-offers", brandId] as const,
  list: (brandId: string) => [...offersKeys.all(brandId), "list"] as const,
  combine: (brandId: string) => [...offersKeys.all(brandId), "combine"] as const,
  /** Storefront reads, by the store's address. */
  live: (slug: string) => ["storefront", slug, "offers"] as const,
  preview: (slug: string, args: OffersPreviewArgs) =>
    ["storefront", slug, "offers-preview", args] as const,
};

export type StoreOfferRow = Tables<"store_offers">;
export type NewStoreOffer = Omit<TablesInsert<"store_offers">, "brand_id">;
export type StoreOfferPatch = TablesUpdate<"store_offers">;
export type OffersCombine = "best" | "code_first" | "together";

const COLUMNS =
  "id, brand_id, kind, name_ar, name_en, is_active, starts_at, ends_at, min_subtotal, min_items, product_ids, category_slugs, exclude_sale_items, discount_type, discount_value, max_discount, buy_quantity, get_quantity, get_product_ids, get_category_slugs, get_percent, max_sets, local_only, created_at, updated_at" as const;

/** The store's offers, oldest first (the order the database tries them in), switched-off ones too. */
export async function fetchStoreOffers(brandId: string): Promise<StoreOfferRow[]> {
  const { data, error } = await supabase
    .from("store_offers")
    .select(COLUMNS)
    .eq("brand_id", brandId)
    .order("created_at", { ascending: true })
    .order("id")
    .limit(200);
  if (error) throw error;
  return data ?? [];
}

/** How an offer meets a promo code the shopper typed (business_settings.offers_combine). */
export async function fetchOffersCombine(brandId: string): Promise<OffersCombine> {
  const { data, error } = await supabase
    .from("business_settings")
    .select("offers_combine")
    .eq("brand_id", brandId)
    .maybeSingle();
  if (error) throw error;
  return (data?.offers_combine as OffersCombine | undefined) ?? "best";
}

export async function createStoreOffer(brandId: string, values: NewStoreOffer) {
  const { error } = await supabase.from("store_offers").insert({ ...values, brand_id: brandId });
  if (error) throw error;
}

export async function updateStoreOffer(brandId: string, offerId: string, patch: StoreOfferPatch) {
  const { data, error } = await supabase
    .from("store_offers")
    .update(patch)
    .eq("id", offerId)
    .eq("brand_id", brandId)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("OFFER_NOT_SAVED");
}

export async function deleteStoreOffer(brandId: string, offerId: string) {
  const { error } = await supabase
    .from("store_offers")
    .delete()
    .eq("id", offerId)
    .eq("brand_id", brandId);
  if (error) throw error;
}

/** Saves the store's combining rule; fails on a write that matched no row. */
export async function saveOffersCombine(brandId: string, combine: OffersCombine) {
  const { data, error } = await supabase
    .from("business_settings")
    .update({ offers_combine: combine })
    .eq("brand_id", brandId)
    .select("brand_id");
  if (error) throw error;
  if (!data?.length) throw new Error("SETTINGS_NOT_SAVED");
}

/** The store's offers are stale after a write. */
export function invalidateStoreOffers(qc: QueryClient, brandId: string) {
  return qc.invalidateQueries({ queryKey: offersKeys.all(brandId) });
}

// ── Storefront ──────────────────────────────────────────────────────────────────────────────

/** The store's offers that are on now, with the terms a shopper is shown. */
export async function fetchLiveOffers(slug: string): Promise<StoreOffer[]> {
  const { data, error } = await supabase.rpc("storefront_active_offers", { p_brand_slug: slug });
  if (error) throw error;
  return Array.isArray(data) ? (data as unknown as StoreOffer[]) : [];
}

export interface OffersPreviewArgs {
  items: Array<{ variant_id: string; quantity: number; line_total: number }>;
  promoCode: string | null;
  fulfillment: string;
  country: string | null;
}

/** What a cart would get from the store's offers, against the code typed (the builder's rule). */
export async function previewOffers(slug: string, args: OffersPreviewArgs): Promise<OffersOutcome> {
  const { data, error } = await supabase.rpc("storefront_offers_preview", {
    p_brand_slug: slug,
    p_items: args.items as unknown as Json,
    p_promo_code: args.promoCode ?? undefined,
    p_fulfillment: args.fulfillment,
    p_country: args.country ?? undefined,
  });
  if (error) throw error;
  const out = (data ?? {}) as Record<string, unknown>;
  return {
    offer_discount: Number(out.offer_discount ?? 0),
    code_discount: Number(out.code_discount ?? 0),
    code_kept: out.code_kept === true,
    code_dropped: out.code_dropped === true,
    free_delivery: out.free_delivery === true,
    applied: Array.isArray(out.applied) ? (out.applied as OffersOutcome["applied"]) : [],
  };
}

export const offersQueries = {
  list: (brandId: string) =>
    queryOptions({
      queryKey: offersKeys.list(brandId),
      queryFn: () => fetchStoreOffers(brandId),
      enabled: Boolean(brandId),
    }),
  combine: (brandId: string) =>
    queryOptions({
      queryKey: offersKeys.combine(brandId),
      queryFn: () => fetchOffersCombine(brandId),
      enabled: Boolean(brandId),
    }),
  live: (slug: string, enabled = true) =>
    queryOptions({
      queryKey: offersKeys.live(slug),
      queryFn: () => fetchLiveOffers(slug),
      enabled: Boolean(slug) && enabled,
      staleTime: 60_000,
    }),
  preview: (slug: string, args: OffersPreviewArgs, enabled = true) =>
    queryOptions({
      queryKey: offersKeys.preview(slug, args),
      queryFn: () => previewOffers(slug, args),
      enabled: Boolean(slug) && enabled && args.items.length > 0,
      staleTime: 30_000,
      placeholderData: (previous) => previous,
    }),
};
