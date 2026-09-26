import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";

/**
 * A brand's own row (`brands`) as the admin settings screens read and write
 * it: names, about text, SEO, logo, hero media, domain. The subscription and
 * plan columns are written by server functions, not here.
 */

export const brandKeys = {
  /** Every brand (super admin list; also the prefix of the lookups below). */
  list: () => ["brands"] as const,
  /** Every brand by name, for pickers (brand switcher, super overrides). */
  directory: () => [...brandKeys.list(), "directory"] as const,
  /** The brand the admin route guard opens, by slug. */
  adminBySlug: (slug: string) => [...brandKeys.list(), "admin-by-slug", slug] as const,
  /** The brand's favicon and logo for the admin shell, by slug. */
  iconsBySlug: (slug: string) => [...brandKeys.list(), "icons-by-slug", slug] as const,
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

/** Every brand the viewer may see, by English name, with the columns pickers show. */
export async function fetchBrandDirectory() {
  const { data, error } = await supabase
    .from("brands")
    .select("id, slug, name_en, name_ar, is_active, plan_type")
    .order("name_en", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** The columns the admin shell needs about the brand it opens (plan, subscription, domain). */
const ADMIN_BRAND_SELECT =
  "id, slug, name_en, name_ar, logo_url, primary_color, is_active, subscription_tier, subscription_status, subscription_expires_at, payment_receipt_url, payment_receipt_uploaded_at, custom_domain, support_access_enabled, plan_type, trial_ends_at, renewal_intent, renewal_intent_recorded_at, created_at";

/**
 * The brand the admin route opens, or null when it is missing or unreadable:
 * the route guard redirects on null (a redirect thrown inside the query would
 * be swallowed and retried as a query error).
 */
export async function fetchAdminBrandBySlug(slug: string) {
  const { data, error } = await supabase
    .from("brands")
    .select(ADMIN_BRAND_SELECT)
    .eq("slug", slug)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}
export type AdminBrand = NonNullable<Awaited<ReturnType<typeof fetchAdminBrandBySlug>>>;

/*
 * Best-effort lookups: each returns null when nothing matches or the read
 * fails, because every caller falls back the same way in both cases (a
 * redirect, an empty search, the next resolution step).
 */

/** The id of the brand with this slug. */
export async function fetchBrandIdBySlug(slug: string) {
  const { data, error } = await supabase.from("brands").select("id").eq("slug", slug).maybeSingle();
  if (error || !data) return null;
  return data.id;
}

/** The slug of this brand. */
export async function fetchBrandSlug(brandId: string) {
  const { data, error } = await supabase
    .from("brands")
    .select("slug")
    .eq("id", brandId)
    .maybeSingle();
  if (error || !data) return null;
  return data.slug;
}

/** The slug of any brand the viewer can read (the admin home's last fallback). */
export async function fetchAnyBrandSlug() {
  const { data, error } = await supabase.from("brands").select("slug").limit(1).maybeSingle();
  if (error || !data) return null;
  return data.slug;
}

/** The brand's favicon and logo from its settings, by slug. */
export async function fetchBrandIconsBySlug(slug: string) {
  const brandId = await fetchBrandIdBySlug(slug);
  if (!brandId) return null;
  const { data, error } = await supabase
    .from("business_settings")
    .select("favicon_url, logo_url")
    .eq("brand_id", brandId)
    .maybeSingle();
  if (error) return null;
  return data;
}

/**
 * The active brand a storefront host points to: `<slug>.boutq.store` or a
 * custom domain. Anonymous visitors may not be allowed to filter by
 * `custom_domain`, so a failed read is "no match".
 */
export async function findActiveBrand(match: { slug: string } | { customDomain: string }) {
  const query = supabase.from("brands").select("id, slug").eq("is_active", true);
  const { data, error } = await (
    "slug" in match ? query.eq("slug", match.slug) : query.eq("custom_domain", match.customDomain)
  ).maybeSingle();
  if (error || !data) return null;
  return data;
}

/** The storefront's custom loading text (both languages), or null. A failed read is none. */
export async function fetchStorefrontLoaderText(brandId: string) {
  const { data } = await supabase
    .from("brand_public_settings")
    .select("storefront_loader_text_en, storefront_loader_text_ar")
    .eq("brand_id", brandId)
    .maybeSingle();
  return data;
}

/** Whether a new store may not take this slug (taken, or the check failed). */
export async function isBrandSlugTaken(slug: string) {
  const { data, error } = await supabase.from("brands").select("id").eq("slug", slug).maybeSingle();
  return Boolean(error || data);
}

export const brandQueries = {
  list: () => queryOptions({ queryKey: brandKeys.list(), queryFn: fetchBrands }),
  directory: () => queryOptions({ queryKey: brandKeys.directory(), queryFn: fetchBrandDirectory }),
  /** Cached five minutes: every admin navigation within the brand runs the guard. */
  adminBySlug: (slug: string) =>
    queryOptions({
      queryKey: brandKeys.adminBySlug(slug),
      queryFn: () => fetchAdminBrandBySlug(slug),
      staleTime: 1000 * 60 * 5,
    }),
  iconsBySlug: (slug: string) =>
    queryOptions({
      queryKey: brandKeys.iconsBySlug(slug),
      queryFn: () => fetchBrandIconsBySlug(slug),
      staleTime: 1000 * 60 * 5,
    }),
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
