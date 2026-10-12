import { supabase } from "@/integrations/supabase/client";
import { readAll } from "@/lib/data/read-all";

/**
 * How many products and categories use each size guide. Every linked product is counted, however
 * many the store has (a list cut at the API's row limit would under-count a guide's use); a
 * failed read counts none, as before.
 */
export async function fetchSizeGuideUsage(brandId: string) {
  const [linkedProducts, linkedCategories] = await Promise.all([
    readAll((from, to) =>
      supabase
        .from("products")
        .select("id, size_guide_id", { count: "exact" })
        .eq("brand_id", brandId)
        .not("size_guide_id", "is", null)
        .order("id")
        .range(from, to),
    ).catch(() => []),
    supabase
      .from("categories")
      .select("id, size_guide_id")
      .eq("brand_id", brandId)
      .not("size_guide_id", "is", null),
  ]);
  const products: Record<string, number> = {};
  const categories: Record<string, number> = {};
  for (const row of linkedProducts) {
    if (row.size_guide_id) products[row.size_guide_id] = (products[row.size_guide_id] || 0) + 1;
  }
  for (const row of linkedCategories.data ?? []) {
    if (row.size_guide_id) categories[row.size_guide_id] = (categories[row.size_guide_id] || 0) + 1;
  }
  return { products, categories };
}
