import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { readAll } from "../read-all";

/**
 * The post kit's shared store (migration 20261120100000): a store's edited posts and its own
 * photos, so they follow its team to any device. Every read and write carries the brand, and the
 * database lets only the staff who may open the content studio in. A post is `Json` here: its
 * shape belongs to the add-on, which reads it defensively.
 */

export type PostKitEditRow = { post_key: string; post: Json; updated_at: string };
export type PostKitPhotoRow = { id: string; name: string; url: string; created_at: string };

const EDIT_COLUMNS = "post_key, post, updated_at" as const;
const PHOTO_COLUMNS = "id, name, url, created_at" as const;

export const postKitKeys = {
  all: (brandId: string) => ["post-kit", brandId] as const,
  edits: (brandId: string) => [...postKitKeys.all(brandId), "edits"] as const,
  photos: (brandId: string) => [...postKitKeys.all(brandId), "photos"] as const,
};

export function fetchPostKitEdits(brandId: string): Promise<PostKitEditRow[]> {
  return readAll((from, to) =>
    supabase
      .from("post_kit_edits")
      .select(EDIT_COLUMNS, { count: "exact" })
      .eq("brand_id", brandId)
      .order("post_key")
      .range(from, to),
  );
}

export function fetchPostKitPhotos(brandId: string): Promise<PostKitPhotoRow[]> {
  return readAll((from, to) =>
    supabase
      .from("post_kit_photos")
      .select(PHOTO_COLUMNS, { count: "exact" })
      .eq("brand_id", brandId)
      .order("created_at")
      .order("id")
      .range(from, to),
  );
}

export const postKitQueries = {
  edits: (brandId: string) =>
    queryOptions({
      queryKey: postKitKeys.edits(brandId),
      queryFn: () => fetchPostKitEdits(brandId),
      enabled: Boolean(brandId),
    }),
  photos: (brandId: string) =>
    queryOptions({
      queryKey: postKitKeys.photos(brandId),
      queryFn: () => fetchPostKitPhotos(brandId),
      enabled: Boolean(brandId),
    }),
};

// ── Writes ───────────────────────────────

/** Saves these posts, one row each, and returns the rows as they are now. */
export async function savePostKitEdits(
  brandId: string,
  edits: { post_key: string; post: Json }[],
): Promise<PostKitEditRow[]> {
  if (!edits.length) return [];
  const { data, error } = await supabase
    .from("post_kit_edits")
    .upsert(
      edits.map((edit) => ({ ...edit, brand_id: brandId })),
      { onConflict: "brand_id,post_key" },
    )
    .select(EDIT_COLUMNS);
  if (error) throw error;
  return data ?? [];
}

/** Takes these posts back to how they came. The answer says which rows really went. */
export async function deletePostKitEdits(brandId: string, postKeys: string[]): Promise<string[]> {
  if (!postKeys.length) return [];
  const { data, error } = await supabase
    .from("post_kit_edits")
    .delete()
    .eq("brand_id", brandId)
    .in("post_key", postKeys)
    .select("post_key");
  if (error) throw error;
  return (data ?? []).map((row) => row.post_key);
}

export async function addPostKitPhoto(
  brandId: string,
  photo: { name: string; url: string },
): Promise<PostKitPhotoRow> {
  const { data, error } = await supabase
    .from("post_kit_photos")
    .insert({ ...photo, brand_id: brandId })
    .select(PHOTO_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

/** Whether the row really went: a refused delete reads as no error, only as nothing deleted. */
export async function deletePostKitPhoto(brandId: string, id: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("post_kit_photos")
    .delete()
    .eq("brand_id", brandId)
    .eq("id", id)
    .select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}
