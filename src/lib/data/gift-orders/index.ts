import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { readGiftOptions, type GiftOrderOptions } from "@/lib/gift-order";

/**
 * A store's gift order settings (migration 20261202100000). A visitor reads the store's offer
 * through `storefront_gift_order_options`; staff read their store's row and write it through
 * `set_gift_order_settings` (staff who may change settings). A store with no row offers gift
 * orders with a free card, as before the settings.
 */

export const giftOrderKeys = {
  all: (brand: string) => ["gift-orders", brand] as const,
  storefront: (slug: string) => [...giftOrderKeys.all(slug), "storefront"] as const,
  settings: (brandId: string) => [...giftOrderKeys.all(brandId), "settings"] as const,
};

/** What the store offers a gift order, for its checkout. */
export async function fetchStorefrontGiftOptions(slug: string): Promise<GiftOrderOptions> {
  const { data, error } = await supabase.rpc("storefront_gift_order_options", { p_slug: slug });
  if (error) throw error;
  return readGiftOptions(data);
}

/** The store's own settings, for its staff (the defaults when it set nothing). */
export async function fetchGiftOrderSettings(brandId: string): Promise<GiftOrderOptions> {
  const { data, error } = await supabase
    .from("gift_order_settings")
    .select("enabled, card_enabled, card_price, prepaid_only")
    .eq("brand_id", brandId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return readGiftOptions(null);
  return {
    enabled: data.enabled,
    // Staff see the card's own switch, whatever the gift switch says.
    card: data.card_enabled,
    cardPrice: Number(data.card_price),
    prepaid: data.prepaid_only,
  };
}

export async function saveGiftOrderSettings(brandId: string, settings: GiftOrderOptions) {
  const { error } = await supabase.rpc("set_gift_order_settings", {
    p_brand_id: brandId,
    p_enabled: settings.enabled,
    p_card_enabled: settings.card,
    p_card_price: settings.cardPrice,
    p_prepaid_only: settings.prepaid,
  });
  if (error) throw error;
}

export const giftOrderQueries = {
  storefront: (slug: string, enabled = true) =>
    queryOptions({
      queryKey: giftOrderKeys.storefront(slug),
      queryFn: () => fetchStorefrontGiftOptions(slug),
      enabled: Boolean(slug) && enabled,
      staleTime: 5 * 60_000,
    }),
  settings: (brandId: string) =>
    queryOptions({
      queryKey: giftOrderKeys.settings(brandId),
      queryFn: () => fetchGiftOrderSettings(brandId),
      enabled: Boolean(brandId),
    }),
};

export function invalidateGiftOrderSettings(qc: QueryClient, brandId: string) {
  return qc.invalidateQueries({ queryKey: giftOrderKeys.settings(brandId) });
}
