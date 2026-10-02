import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { FaqItem, GalleryItem } from "@/lib/store-content";
import type { faqColumns, galleryColumns } from "@/lib/store-content";

/**
 * A store's gallery pictures and FAQ (store_gallery_items, store_faq_items;
 * migration 20261002140000). The merchant's lists include switched-off items;
 * the storefront's lists are the active ones only (row-level security would
 * show a signed-in merchant their hidden ones on the storefront too).
 */

export const storeContentKeys = {
  all: (brandId: string) => ["store-content", brandId] as const,
  gallery: (brandId: string, scope: "admin" | "public") =>
    [...storeContentKeys.all(brandId), "gallery", scope] as const,
  faq: (brandId: string, scope: "admin" | "public") =>
    [...storeContentKeys.all(brandId), "faq", scope] as const,
};

const GALLERY_COLUMNS = "id, image_url, caption_en, caption_ar, sort_order, is_active" as const;
const FAQ_COLUMNS =
  "id, group_en, group_ar, question_en, question_ar, answer_en, answer_ar, sort_order, is_active" as const;

export async function fetchGallery(brandId: string, activeOnly: boolean): Promise<GalleryItem[]> {
  let query = supabase.from("store_gallery_items").select(GALLERY_COLUMNS).eq("brand_id", brandId);
  if (activeOnly) query = query.eq("is_active", true);
  const { data, error } = await query
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchFaq(brandId: string, activeOnly: boolean): Promise<FaqItem[]> {
  let query = supabase.from("store_faq_items").select(FAQ_COLUMNS).eq("brand_id", brandId);
  if (activeOnly) query = query.eq("is_active", true);
  const { data, error } = await query
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export const storeContentQueries = {
  gallery: (brandId: string) =>
    queryOptions({
      queryKey: storeContentKeys.gallery(brandId, "admin"),
      queryFn: () => fetchGallery(brandId, false),
      enabled: Boolean(brandId),
    }),
  faq: (brandId: string) =>
    queryOptions({
      queryKey: storeContentKeys.faq(brandId, "admin"),
      queryFn: () => fetchFaq(brandId, false),
      enabled: Boolean(brandId),
    }),
  publicGallery: (brandId: string) =>
    queryOptions({
      queryKey: storeContentKeys.gallery(brandId, "public"),
      queryFn: () => fetchGallery(brandId, true),
      enabled: Boolean(brandId),
      staleTime: 5 * 60_000,
    }),
  publicFaq: (brandId: string) =>
    queryOptions({
      queryKey: storeContentKeys.faq(brandId, "public"),
      queryFn: () => fetchFaq(brandId, true),
      enabled: Boolean(brandId),
      staleTime: 5 * 60_000,
    }),
};

export function invalidateStoreContent(qc: QueryClient, brandId: string) {
  return qc.invalidateQueries({ queryKey: storeContentKeys.all(brandId) });
}

// ── Writes (settings managers; the tables' policies enforce it) ─────────────

type GalleryColumns = ReturnType<typeof galleryColumns>;
type FaqColumns = ReturnType<typeof faqColumns>;

/** Adds a picture (no id, after `sortOrder`) or changes one. */
export async function saveGalleryItem(
  brandId: string,
  id: string | null,
  columns: GalleryColumns,
  sortOrder: number,
) {
  const query = id
    ? supabase.from("store_gallery_items").update(columns).eq("id", id).eq("brand_id", brandId)
    : supabase
        .from("store_gallery_items")
        .insert({ ...columns, brand_id: brandId, sort_order: sortOrder });
  const { error } = await query;
  if (error) throw error;
}

export async function deleteGalleryItem(brandId: string, id: string) {
  const { error } = await supabase
    .from("store_gallery_items")
    .delete()
    .eq("id", id)
    .eq("brand_id", brandId);
  if (error) throw error;
}

/** Adds a question (no id, after `sortOrder`) or changes one. */
export async function saveFaqItem(
  brandId: string,
  id: string | null,
  columns: FaqColumns,
  sortOrder: number,
) {
  const query = id
    ? supabase.from("store_faq_items").update(columns).eq("id", id).eq("brand_id", brandId)
    : supabase
        .from("store_faq_items")
        .insert({ ...columns, brand_id: brandId, sort_order: sortOrder });
  const { error } = await query;
  if (error) throw error;
}

export async function deleteFaqItem(brandId: string, id: string) {
  const { error } = await supabase
    .from("store_faq_items")
    .delete()
    .eq("id", id)
    .eq("brand_id", brandId);
  if (error) throw error;
}

/** Writes a new order: one update per item that moved. */
export async function reorderStoreContent(
  brandId: string,
  table: "store_gallery_items" | "store_faq_items",
  order: ReadonlyArray<{ id: string; sort_order: number }>,
) {
  const results = await Promise.all(
    order.map(({ id, sort_order }) =>
      supabase.from(table).update({ sort_order }).eq("id", id).eq("brand_id", brandId),
    ),
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;
}
