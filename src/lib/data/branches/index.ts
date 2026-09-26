import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * A brand's branches (stores and pickup points): the order editor's branch
 * picker, the returns inspection's restock branch, one branch on an invoice,
 * and the storefront checkout's pickup branches (a public function, so
 * shoppers never read the table).
 */

export const branchesKeys = {
  all: (brandId: string) => ["branches", brandId] as const,
  active: (brandId: string) => [...branchesKeys.all(brandId), "active"] as const,
  one: (brandId: string, branchId: string) =>
    [...branchesKeys.all(brandId), "one", branchId] as const,
};

/** Every branch of the brand, with its location (order editor). */
export async function fetchBranches(brandId: string) {
  const { data, error } = await supabase
    .from("branches")
    .select("id, name_ar, name_en, location_ar, location_en")
    .eq("brand_id", brandId);
  if (error) throw error;
  return data ?? [];
}

/** The brand's active branches, in display order (returns inspection). */
export async function fetchActiveBranches(brandId: string) {
  const { data, error } = await supabase
    .from("branches")
    .select("id, name_ar, name_en, is_active, sort_order")
    .eq("brand_id", brandId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** One branch's name and location for an invoice, or null when it cannot be read. */
export async function fetchBranch(brandId: string, branchId: string) {
  const { data, error } = await supabase
    .from("branches")
    .select("name_ar, name_en, location_ar, location_en")
    .eq("id", branchId)
    .eq("brand_id", brandId)
    .maybeSingle();
  if (error) return null;
  return data;
}

/** The pickup branches a shopper can choose at checkout. A failed read offers none. */
export async function fetchPublicBranches(brandId: string) {
  const { data } = await supabase.rpc("get_public_branches", { p_brand_id: brandId });
  return data ?? [];
}
export type PublicBranch = Awaited<ReturnType<typeof fetchPublicBranches>>[number];

export const branchesQueries = {
  list: (brandId: string) =>
    queryOptions({
      queryKey: branchesKeys.all(brandId),
      queryFn: () => fetchBranches(brandId),
      enabled: Boolean(brandId),
    }),
  active: (brandId: string) =>
    queryOptions({
      queryKey: branchesKeys.active(brandId),
      queryFn: () => fetchActiveBranches(brandId),
      enabled: Boolean(brandId),
    }),
  one: (brandId: string, branchId: string) =>
    queryOptions({
      queryKey: branchesKeys.one(brandId, branchId),
      queryFn: () => fetchBranch(brandId, branchId),
      enabled: Boolean(brandId && branchId),
    }),
};
