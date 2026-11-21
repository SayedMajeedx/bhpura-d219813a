import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * What a store's gift cards are drawn with (migration 20261107100000): the designs it turned off,
 * its signature card, and the photos its photo designs use (the products it chose, else its newest
 * with a photo). Anyone drawing a card reads it (`storefront_gift_card_designs`); staff who may
 * change settings write it (`set_gift_card_designs`, which cleans what it keeps).
 */

/** A font the store uploaded for its cards (its address and the name it was uploaded under). */
export type CardFontUpload = { url: string; name: string | null };

/**
 * A card font in one language (migration 20261215100000): one of the store's uploads, or one of
 * the platform's faces (`face`: an id of `CARD_FACE_LIST`, or `own` for the cards' own faces,
 * which only a gift message card chooses on purpose).
 */
export type CardFontChoice = CardFontUpload | { face: string };

/** A choice for each language (null: the default, the cards' own faces or the gift cards'). */
export type CardFontChoices = { ar: CardFontChoice | null; en: CardFontChoice | null };

export type CardDesignsRow = {
  off: string[];
  signature: string | null;
  photo_products: string[];
  photos: string[];
  /** How large the store's mark is drawn on its cards (1 as designed). */
  logo_scale: number;
  /** The gift cards' fonts by language (migrations 20261108100000, 20261215100000). */
  fonts: CardFontChoices;
  /** A gift message card's fonts by language (null: the gift cards'). */
  message_fonts: CardFontChoices;
};

const EMPTY: CardDesignsRow = {
  off: [],
  signature: null,
  photo_products: [],
  photos: [],
  logo_scale: 1,
  fonts: { ar: null, en: null },
  message_fonts: { ar: null, en: null },
};

function fontUpload(value: unknown): CardFontUpload | null {
  const row = (value && typeof value === "object" ? value : null) as Partial<CardFontUpload> | null;
  return row && typeof row.url === "string" && row.url
    ? { url: row.url, name: typeof row.name === "string" ? row.name : null }
    : null;
}

function fontChoice(value: unknown): CardFontChoice | null {
  const face = (value && typeof value === "object" ? value : null) as { face?: unknown } | null;
  if (face && typeof face.face === "string" && /^[a-z]+$/.test(face.face))
    return { face: face.face };
  return fontUpload(value);
}

function fontChoices(value: unknown): CardFontChoices {
  const row = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return { ar: fontChoice(row.ar), en: fontChoice(row.en) };
}

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
    logo_scale: typeof row.logo_scale === "number" && row.logo_scale > 0 ? row.logo_scale : 1,
    fonts: fontChoices(row.fonts),
    message_fonts: fontChoices(row.message_fonts),
  };
}

/**
 * The fonts a store uploaded for its cards, kept to choose again (staff read them from the store's
 * settings; a visitor never needs them). An older store's chosen uploads are among them.
 */
export async function fetchCardFontLibrary(brandId: string): Promise<CardFontUpload[]> {
  const { data, error } = await supabase
    .from("gift_card_settings")
    .select("card_designs")
    .eq("brand_id", brandId)
    .maybeSingle();
  if (error) throw error;
  const designs = (data?.card_designs ?? {}) as { font_library?: unknown };
  const list = Array.isArray(designs.font_library) ? designs.font_library : [];
  return list.flatMap((value) => {
    const upload = fontUpload(value);
    return upload ? [upload] : [];
  });
}

export async function saveCardDesigns(
  brandId: string,
  input: {
    off: string[];
    signature: string | null;
    photoProducts: string[];
    logoScale: number;
    fonts: CardFontChoices;
    messageFonts: CardFontChoices;
    library: CardFontUpload[];
  },
) {
  const byLanguage = (set: CardFontChoices) => ({
    ...(set.ar ? { ar: set.ar } : {}),
    ...(set.en ? { en: set.en } : {}),
  });
  const { data, error } = await supabase.rpc("set_gift_card_designs", {
    p_brand_id: brandId,
    p_designs: {
      off: input.off,
      signature: input.signature,
      photo_products: input.photoProducts,
      logo_scale: input.logoScale,
      fonts: byLanguage(input.fonts),
      message_fonts: byLanguage(input.messageFonts),
      font_library: input.library,
    },
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
  fontLibrary: (brandId: string) => ["gift-cards", brandId, "font-library"] as const,
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
  fontLibrary: (brandId: string) =>
    queryOptions({
      queryKey: cardDesignKeys.fontLibrary(brandId),
      queryFn: () => fetchCardFontLibrary(brandId),
      enabled: Boolean(brandId),
      staleTime: 5 * 60_000,
    }),
};

export function invalidateCardDesigns(qc: QueryClient, brandId: string) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: cardDesignKeys.store(brandId) }),
    qc.invalidateQueries({ queryKey: cardDesignKeys.fontLibrary(brandId) }),
  ]);
}
