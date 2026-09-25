import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";

/**
 * A brand's own row (`brands`) as the admin settings screens read and write
 * it: names, about text, SEO, logo, hero media, domain. The subscription and
 * plan columns are written by server functions, not here.
 */

export const brandKeys = {
  /** Every brand (super admin list). */
  list: () => ["brands"] as const,
  /** One brand's profile for the settings screens. */
  profile: (brandId: string) => ["brand", brandId] as const,
};

/** The brand's profile columns the settings screens edit, or null when not visible. */
export async function fetchBrandProfile(brandId: string) {
  const { data, error } = await supabase
    .from("brands")
    .select(
      "id, slug, name_en, name_ar, hero_media, about_ar, about_en, meta_title, meta_description, logo_url, custom_domain, support_access_enabled, primary_color, plan_type, trial_ends_at",
    )
    .eq("id", brandId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
export type BrandProfile = NonNullable<Awaited<ReturnType<typeof fetchBrandProfile>>>;

/** Every brand the viewer may see, newest first (the super admin's list). */
export async function fetchBrands() {
  const { data, error } = await supabase
    .from("brands")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export const brandQueries = {
  list: () => queryOptions({ queryKey: brandKeys.list(), queryFn: fetchBrands }),
  profile: (brandId: string) =>
    queryOptions({
      queryKey: brandKeys.profile(brandId),
      queryFn: () => fetchBrandProfile(brandId),
      enabled: Boolean(brandId),
    }),
};

export type BrandPatch = TablesUpdate<"brands">;

/** Changes columns of one brand. */
export async function updateBrand(brandId: string, patch: BrandPatch) {
  const { error } = await supabase.from("brands").update(patch).eq("id", brandId);
  if (error) throw error;
}

/** The brand's profile and the super admin's brand list are stale after a write. */
export function invalidateBrand(qc: QueryClient, brandId: string) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: brandKeys.profile(brandId) }),
    qc.invalidateQueries({ queryKey: brandKeys.list() }),
  ]);
}
