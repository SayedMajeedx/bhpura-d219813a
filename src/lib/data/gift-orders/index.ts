import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { readGiftOptions, type GiftOrderOptions } from "@/lib/gift-order";
import {
  readGiftAddonRow,
  readGiftAddons,
  type GiftAddon,
  type GiftAddonRow,
} from "@/lib/gift-addons";

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
  addons: (slug: string) => [...giftOrderKeys.all(slug), "addons"] as const,
  storeAddons: (brandId: string) => [...giftOrderKeys.all(brandId), "store-addons"] as const,
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

/** The add-ons a visitor may add to a gift order (available ones, while gifts are on). */
export async function fetchStorefrontGiftAddons(slug: string): Promise<GiftAddon[]> {
  const { data, error } = await supabase.rpc("storefront_gift_addons", { p_slug: slug });
  if (error) throw error;
  return readGiftAddons(data);
}

/** The store's add-ons for its staff, archived ones left out (a store has a handful). */
export async function fetchGiftAddons(brandId: string): Promise<GiftAddonRow[]> {
  const { data, error } = await supabase
    .from("gift_addons")
    .select(
      "id, name_ar, name_en, description_ar, description_en, image_url, price, is_available, sort_order",
    )
    .eq("brand_id", brandId)
    .is("archived_at", null)
    .order("sort_order")
    .order("created_at")
    .limit(100);
  if (error) throw error;
  return (data ?? [])
    .map((row) => readGiftAddonRow(row as Record<string, unknown>))
    .filter((row): row is GiftAddonRow => row !== null);
}

export type GiftAddonInput = {
  id: string | null;
  nameAr: string;
  nameEn: string;
  imageUrl: string | null;
  price: number;
  isAvailable: boolean;
  sortOrder: number;
};

/** Adds an add-on (no id) or changes one; staff who may change settings. */
export async function saveGiftAddon(brandId: string, input: GiftAddonInput) {
  const { error } = await supabase.rpc("save_gift_addon", {
    p_brand_id: brandId,
    p_name_ar: input.nameAr,
    p_name_en: input.nameEn,
    // Empty is kept as none by the function.
    p_description_ar: "",
    p_description_en: "",
    p_image_url: input.imageUrl ?? "",
    p_price: input.price,
    p_is_available: input.isAvailable,
    p_sort_order: input.sortOrder,
    ...(input.id ? { p_id: input.id } : {}),
  });
  if (error) throw error;
}

/** Removes an add-on from the store (archived: orders that hold it keep its name). */
export async function archiveGiftAddon(id: string) {
  const { error } = await supabase.rpc("archive_gift_addon", { p_id: id });
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
  addons: (slug: string, enabled = true) =>
    queryOptions({
      queryKey: giftOrderKeys.addons(slug),
      queryFn: () => fetchStorefrontGiftAddons(slug),
      enabled: Boolean(slug) && enabled,
      staleTime: 60_000,
    }),
  storeAddons: (brandId: string) =>
    queryOptions({
      queryKey: giftOrderKeys.storeAddons(brandId),
      queryFn: () => fetchGiftAddons(brandId),
      enabled: Boolean(brandId),
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

export function invalidateGiftAddons(qc: QueryClient, brandId: string) {
  return qc.invalidateQueries({ queryKey: giftOrderKeys.storeAddons(brandId) });
}
