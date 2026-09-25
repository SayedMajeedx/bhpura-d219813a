import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

/**
 * A brand's categories for the admin screens. Before this, three queries with
 * different shapes filled `["categories", brandId]` (bug backlog #1): the
 * Categories page's dialog (every category, errors thrown), the inventory
 * filters (active only, errors read as empty) and the product editor (active
 * only, errors thrown). Now each shape has its own key under that prefix, so
 * one `invalidateCategories` still refreshes them all.
 */

export const categoriesKeys = {
  all: (brandId: string) => ["categories", brandId] as const,
  /** Every category, active or not (parent picker). */
  list: (brandId: string) => [...categoriesKeys.all(brandId), "all"] as const,
  /** Active categories, for pickers and filters. */
  active: (brandId: string) => [...categoriesKeys.all(brandId), "active"] as const,
  /** Every category with its product counts (Categories page). */
  overview: (brandId: string) => [...categoriesKeys.all(brandId), "overview"] as const,
  /** The columns the data export writes. */
  exportRows: (brandId: string) => [...categoriesKeys.all(brandId), "export"] as const,
};

export type CategoryRow = Tables<"categories">;
export type CategoryWithCounts = CategoryRow & {
  product_count?: number;
  total_product_count?: number;
  is_smart?: boolean;
};

/** Every category of the brand, in menu order. */
export async function fetchCategories(brandId: string): Promise<CategoryRow[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("brand_id", brandId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** The brand's active categories, in menu order. */
export async function fetchActiveCategories(brandId: string) {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name_en, name_ar, slug")
    .eq("brand_id", brandId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
export type ActiveCategory = Awaited<ReturnType<typeof fetchActiveCategories>>[number];

/** The columns the data export writes; a failure reads as none. */
export async function fetchCategoriesForExport(brandId: string) {
  const { data } = await supabase
    .from("categories")
    .select("id, name, name_ar, name_en")
    .eq("brand_id", brandId);
  return data ?? [];
}

/**
 * Every category with its active and total product counts, from the server
 * (`get_brand_categories_with_counts`). When that returns nothing or fails,
 * the counts are worked out here: "new" categories count every active
 * product, "best sellers" count one, "sale" counts active products on sale
 * (or every active product), others count products whose category is the
 * slug, English name or id.
 */
export async function fetchCategoriesOverview(brandId: string): Promise<CategoryWithCounts[]> {
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "get_brand_categories_with_counts",
      { p_brand_id: brandId },
    );
    if (!rpcError && Array.isArray(rpcData) && rpcData.length > 0) {
      return rpcData as unknown as CategoryWithCounts[];
    }
  } catch (err) {
    console.warn("Falling back to client-side category count calculation:", err);
  }

  const [{ data: cats, error: catErr }, { data: prods }] = await Promise.all([
    supabase
      .from("categories")
      .select("*")
      .eq("brand_id", brandId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("products")
      .select("id, category, is_active, show_sale_badge")
      .eq("brand_id", brandId),
  ]);
  if (catErr) throw catErr;

  const productsList = prods ?? [];
  const totalActiveProducts = productsList.filter((p) => p.is_active).length;

  return (cats ?? []).map((cat) => {
    const slug = cat.slug || "";
    const nameEn = cat.name_en || "";

    if (["new-arrivals", "new"].includes(slug)) {
      return {
        ...cat,
        product_count: totalActiveProducts,
        total_product_count: totalActiveProducts,
        is_smart: true,
      };
    }
    if (["most-selling", "best-sellers", "best-selling"].includes(slug)) {
      return { ...cat, product_count: 1, total_product_count: 1, is_smart: true };
    }
    if (["sale", "offers", "discounts"].includes(slug)) {
      const saleCount = productsList.filter((p) => p.is_active && p.show_sale_badge).length;
      return {
        ...cat,
        product_count: saleCount || totalActiveProducts,
        total_product_count: saleCount || totalActiveProducts,
        is_smart: true,
      };
    }

    const matches = productsList.filter(
      (p) => p.category === slug || p.category === nameEn || p.category === cat.id,
    );
    const activeMatches = matches.filter((p) => p.is_active);
    return {
      ...cat,
      product_count: activeMatches.length,
      total_product_count: matches.length,
      is_smart: false,
    };
  });
}

export const categoriesQueries = {
  list: (brandId: string) =>
    queryOptions({
      queryKey: categoriesKeys.list(brandId),
      queryFn: () => fetchCategories(brandId),
      enabled: Boolean(brandId),
    }),
  active: (brandId: string) =>
    queryOptions({
      queryKey: categoriesKeys.active(brandId),
      queryFn: () => fetchActiveCategories(brandId),
      enabled: Boolean(brandId),
    }),
  overview: (brandId: string) =>
    queryOptions({
      queryKey: categoriesKeys.overview(brandId),
      queryFn: () => fetchCategoriesOverview(brandId),
      enabled: Boolean(brandId),
    }),
  exportRows: (brandId: string) =>
    queryOptions({
      queryKey: categoriesKeys.exportRows(brandId),
      queryFn: () => fetchCategoriesForExport(brandId),
      enabled: Boolean(brandId),
    }),
};

// ── Writes ──────────────────────────────────────────────────────────────────

export type NewCategory = TablesInsert<"categories">;
export type CategoryPatch = TablesUpdate<"categories">;

/** Every category list of the brand is stale after a write. */
export function invalidateCategories(qc: QueryClient, brandId: string) {
  return qc.invalidateQueries({ queryKey: categoriesKeys.all(brandId) });
}

export async function createCategory(brandId: string, values: NewCategory) {
  const { error } = await supabase.from("categories").insert({ ...values, brand_id: brandId });
  if (error) throw error;
}

export async function updateCategory(brandId: string, categoryId: string, patch: CategoryPatch) {
  const { error } = await supabase
    .from("categories")
    .update(patch)
    .eq("id", categoryId)
    .eq("brand_id", brandId);
  if (error) throw error;
}

/**
 * Writes new menu positions. Each update's error is ignored, as the reorder
 * buttons always have (bug backlog #20).
 */
export async function setCategorySortOrders(
  brandId: string,
  positions: Array<{ id: string; sort_order: number }>,
) {
  await Promise.all(
    positions.map(({ id, sort_order }) =>
      supabase.from("categories").update({ sort_order }).eq("id", id).eq("brand_id", brandId),
    ),
  );
}

/**
 * Deletes a category, or deactivates it when products still use it (the
 * server decides). Returns what happened and how many products are linked.
 */
export async function deleteCategory(categoryId: string) {
  const { data, error } = await supabase.rpc("delete_category", { p_id: categoryId });
  if (error) throw error;
  const result = (data ?? {}) as { mode?: string; linked_products?: number };
  return { mode: result.mode, linkedProducts: result.linked_products ?? 0 };
}
