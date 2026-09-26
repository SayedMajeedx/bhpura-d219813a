import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * The addon data core screens read (core must not import `@/addons/*`): which
 * addons a brand has installed (the invoice's variant labels), its active size
 * guides (category and product pickers), and Fit Passport measurements (the
 * store profile's count, the order editor's customer panel). Installing and
 * configuring addons goes through `@/lib/addons/addons.functions`.
 */

export const addonDataKeys = {
  /** Under the addons prefix, so installing or disabling an addon refreshes it. */
  installedIds: (brandId: string) => ["addons", brandId, "installed-ids"] as const,
  sizeGuides: (brandId: string) => ["size-guides", brandId, "active"] as const,
  fitPassports: (brandId: string) => ["fit-passports", brandId] as const,
  fitPassportCount: (brandId: string) => [...addonDataKeys.fitPassports(brandId), "count"] as const,
  customerFitPassport: (brandId: string, customerId: string) =>
    [...addonDataKeys.fitPassports(brandId), "customer", customerId] as const,
};

/** The brand's installed addons (id and status). A failed read is none. */
export async function fetchInstalledAddonIds(brandId: string) {
  const { data } = await supabase
    .from("brand_addons")
    .select("addon_id, status")
    .eq("brand_id", brandId)
    .eq("status", "installed");
  return data ?? [];
}

/** The brand's active size guides, in display order. A failed read is none. */
export async function fetchActiveSizeGuides(brandId: string) {
  const { data } = await supabase
    .from("size_guides")
    .select("id, name_ar, name_en, is_default")
    .eq("brand_id", brandId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  return data ?? [];
}

/** How many customers of the brand saved a Fit Passport. A failed read counts none. */
export async function countFitPassports(brandId: string) {
  const { count, error } = await supabase
    .from("customer_fit_passports")
    .select("*", { count: "exact", head: true })
    .eq("brand_id", brandId);
  if (error) return 0;
  return count ?? 0;
}

/** One customer's saved measurements in the brand, or null when none. */
export async function fetchCustomerFitPassport(brandId: string, customerId: string) {
  const { data, error } = await supabase
    .from("customer_fit_passports")
    .select("measurements,preferred_length_unit,version")
    .eq("brand_id", brandId)
    .eq("customer_id", customerId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export const addonDataQueries = {
  installedIds: (brandId: string) =>
    queryOptions({
      queryKey: addonDataKeys.installedIds(brandId),
      queryFn: () => fetchInstalledAddonIds(brandId),
      enabled: Boolean(brandId),
    }),
  sizeGuides: (brandId: string) =>
    queryOptions({
      queryKey: addonDataKeys.sizeGuides(brandId),
      queryFn: () => fetchActiveSizeGuides(brandId),
      enabled: Boolean(brandId),
    }),
  fitPassportCount: (brandId: string) =>
    queryOptions({
      queryKey: addonDataKeys.fitPassportCount(brandId),
      queryFn: () => countFitPassports(brandId),
      enabled: Boolean(brandId),
      staleTime: 60_000,
    }),
  customerFitPassport: (brandId: string, customerId: string) =>
    queryOptions({
      queryKey: addonDataKeys.customerFitPassport(brandId, customerId),
      queryFn: () => fetchCustomerFitPassport(brandId, customerId),
      enabled: Boolean(brandId && customerId),
    }),
};
