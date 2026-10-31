import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * What a store's gift cards are drawn with (migration 20261107100000): the designs it turned off,
 * its signature card, and the photos its photo designs use (the products it chose, else its newest
 * with a photo). Anyone drawing a card reads it (`storefront_gift_card_designs`); staff who may
 * change settings write it (`set_gift_card_designs`, which cleans what it keeps).
 */

export type CardDesignsRow = {
  off: string[];
  signature: string | null;
  photo_products: string[];
  photos: string[];
};

const EMPTY: CardDesignsRow = { off: [], signature: null, photo_products: [], photos: [] };

export async function fetchCardDesigns(brandId: string): Promise<CardDesignsRow> {
  const { data, error } = await supabase.rpc("storefront_gift_card_designs", {
    p_brand_id: brandId,
  });
  if (error) throw error;
  const row = (data ?? {}) as Partial<CardDesignsRow>;
  return {
    off: Array.isArray(row.off) ? row.off : [],
    signature: typeof row.signature === "string" ? row.signature : null,
    photo_products: Array.isArray(row.photo_products) ? row.photo_products : [],
    photos: Array.isArray(row.photos) ? row.photos : [],
  };
}

export async function saveCardDesigns(
  brandId: string,
  input: { off: string[]; signature: string | null; photoProducts: string[] },
) {
  const { data, error } = await supabase.rpc("set_gift_card_designs", {
    p_brand_id: brandId,
    p_designs: { off: input.off, signature: input.signature, photo_products: input.photoProducts },
  });
  if (error) throw error;
  return data;
}

export type PhotoChoice = {
  id: string;
  name_en: string | null;
  name_ar: string | null;
  photo: string;
};

/** The store's products with a photo, the newest first, for choosing the cards' photos. */
export async function fetchPhotoChoices(brandId: string): Promise<PhotoChoice[]> {
  const { data, error } = await supabase
    .from("products")
    .select("id, name_en, name_ar, image_url, media")
    .eq("brand_id", brandId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) throw error;
  return (data ?? []).flatMap((row) => {
    const media = Array.isArray(row.media)
      ? (row.media as Array<{ url?: string; type?: string }>)
      : [];
    const photo =
      row.image_url?.trim() ||
      media.find((m) => m?.url && (m.type === "image" || !m.type))?.url ||
      null;
    return photo ? [{ id: row.id, name_en: row.name_en, name_ar: row.name_ar, photo }] : [];
  });
}

export const cardDesignKeys = {
  store: (brandId: string) => ["gift-cards", brandId, "designs"] as const,
  photoChoices: (brandId: string) => ["gift-cards", brandId, "design-photos"] as const,
};

export const cardDesignQueries = {
  store: (brandId: string) =>
    queryOptions({
      queryKey: cardDesignKeys.store(brandId),
      queryFn: () => fetchCardDesigns(brandId),
      enabled: Boolean(brandId),
      staleTime: 5 * 60_000,
      placeholderData: EMPTY,
    }),
  photoChoices: (brandId: string) =>
    queryOptions({
      queryKey: cardDesignKeys.photoChoices(brandId),
      queryFn: () => fetchPhotoChoices(brandId),
      enabled: Boolean(brandId),
    }),
};

export function invalidateCardDesigns(qc: QueryClient, brandId: string) {
  return qc.invalidateQueries({ queryKey: cardDesignKeys.store(brandId) });
}
