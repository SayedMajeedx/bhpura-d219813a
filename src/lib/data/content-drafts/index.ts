import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

/**
 * The content studio's saved drafts: a brand's designs (template, format,
 * product and the studio's choices) that its team can reopen. Every read and
 * write carries the brand; row-level security lets only the brand's own
 * staff see them (can_access_brand).
 */

/** The most recent drafts the studio lists. */
export const CONTENT_DRAFTS_LIMIT = 50;

const DRAFT_COLUMNS = "id, name, template_id, format, product_id, settings, updated_at" as const;

export const contentDraftsKeys = {
  all: (brandId: string) => ["content-drafts", brandId] as const,
  list: (brandId: string) => [...contentDraftsKeys.all(brandId), "list"] as const,
};

/** The brand's drafts, most recently saved first. */
export async function fetchContentDrafts(brandId: string) {
  const { data, error } = await supabase
    .from("content_studio_drafts")
    .select(DRAFT_COLUMNS)
    .eq("brand_id", brandId)
    .order("updated_at", { ascending: false })
    .limit(CONTENT_DRAFTS_LIMIT);
  if (error) throw error;
  return data ?? [];
}

export type ContentDraft = Awaited<ReturnType<typeof fetchContentDrafts>>[number];

export const contentDraftsQueries = {
  list: (brandId: string) =>
    queryOptions({
      queryKey: contentDraftsKeys.list(brandId),
      queryFn: () => fetchContentDrafts(brandId),
      enabled: Boolean(brandId),
    }),
};

// ── Writes ──────────────────────────────────────────────────────────────────

export type ContentDraftValues = {
  name: string;
  template_id: string;
  format: string;
  product_id: string | null;
  settings: Json;
};

export function invalidateContentDrafts(qc: QueryClient, brandId: string) {
  return qc.invalidateQueries({ queryKey: contentDraftsKeys.all(brandId) });
}

/** Saves a new draft in the brand and returns its id. */
export async function createContentDraft(
  brandId: string,
  values: ContentDraftValues,
): Promise<string> {
  const { data, error } = await supabase
    .from("content_studio_drafts")
    .insert({ ...values, brand_id: brandId })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/** Overwrites a draft with the studio's current design. */
export async function updateContentDraft(
  brandId: string,
  draftId: string,
  values: ContentDraftValues,
) {
  const { error } = await supabase
    .from("content_studio_drafts")
    .update(values)
    .eq("id", draftId)
    .eq("brand_id", brandId);
  if (error) throw error;
}

export async function deleteContentDraft(brandId: string, draftId: string) {
  const { error } = await supabase
    .from("content_studio_drafts")
    .delete()
    .eq("id", draftId)
    .eq("brand_id", brandId);
  if (error) throw error;
}
