import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import type { StoreVertical } from "@/lib/store-profile";
import {
  changeBrandVertical,
  previewVerticalChange,
} from "@/lib/verticals/vertical-change.functions";

/**
 * A store's vertical: its change history (the brand's own staff can read it)
 * and, for a super admin, the preview and the change itself (server
 * functions; see vertical-change.functions).
 */

export const verticalKeys = {
  all: (brandId: string) => ["verticals", brandId] as const,
  history: (brandId: string) => [...verticalKeys.all(brandId), "history"] as const,
  preview: (brandId: string, vertical: string, syncCategories: boolean) =>
    [...verticalKeys.all(brandId), "preview", vertical, syncCategories] as const,
};

/** The store's vertical changes, newest first. */
export async function fetchVerticalChanges(brandId: string) {
  const { data, error } = await supabase
    .from("brand_vertical_changes")
    .select("id, from_vertical, to_vertical, reason, applied, created_at")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return data ?? [];
}

export type VerticalChange = Awaited<ReturnType<typeof fetchVerticalChanges>>[number];

export const verticalQueries = {
  history: (brandId: string) =>
    queryOptions({
      queryKey: verticalKeys.history(brandId),
      queryFn: () => fetchVerticalChanges(brandId),
      enabled: Boolean(brandId),
    }),
  preview: (brandId: string, vertical: StoreVertical | null, syncCategories: boolean) =>
    queryOptions({
      queryKey: verticalKeys.preview(brandId, vertical ?? "", syncCategories),
      queryFn: () =>
        previewVerticalChange({ data: { brandId, vertical: vertical!, syncCategories } }),
      enabled: Boolean(brandId && vertical),
      staleTime: 0,
    }),
};

export type VerticalChangeInput = {
  brandId: string;
  vertical: StoreVertical;
  reason: string;
  disableAddons: string[];
  syncCategories: boolean;
};

/** Changes the store's vertical (super admin only; see changeBrandVertical). */
export function changeVertical(input: VerticalChangeInput) {
  return changeBrandVertical({ data: input });
}

/** Everything a vertical change touches is stale afterwards. */
export function invalidateAfterVerticalChange(qc: QueryClient, brandId: string) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: verticalKeys.all(brandId) }),
    qc.invalidateQueries({ queryKey: queryKeys.brand.storeProfile(brandId) }),
    qc.invalidateQueries({ queryKey: queryKeys.brand.businessSettings(brandId) }),
    qc.invalidateQueries({ queryKey: queryKeys.brand.profile(brandId) }),
    qc.invalidateQueries({ queryKey: queryKeys.addons.all(brandId) }),
    qc.invalidateQueries({ queryKey: queryKeys.categories.all(brandId) }),
    qc.invalidateQueries({ queryKey: queryKeys.categories.overview(brandId) }),
  ]);
}
