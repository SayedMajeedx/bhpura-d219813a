import { publicSupabase as supabase } from "@/integrations/supabase/client";

export async function fetchActiveBrandIdentity(slug: string) {
  const { data, error } = await supabase
    .from("brands")
    .select("id, slug")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function fetchStorefrontProducts(brandId: string) {
  const { data, error } = await supabase
    .from("products")
    .select(
      "id, name, name_ar, name_en, description, description_ar, description_en, category, image_url, media, brand_id, created_at, featured_trending, show_sale_badge, product_variants(id, selling_price, original_price, stock_main, size, color)",
    )
    .eq("brand_id", brandId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchStorefrontCategories(brandId: string) {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name_en, name_ar, slug, image_url, parent_id, sort_order")
    .eq("brand_id", brandId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchBestSellerRows(slug: string, limit = 8) {
  const { data, error } = await (supabase.rpc as any)("get_storefront_best_sellers", {
    p_brand_slug: slug,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as Array<{ product_id: string; units_sold: number }>;
}

export async function fetchTrendingRows(slug: string, limit = 8) {
  const { data, error } = await (supabase.rpc as any)("get_storefront_trending", {
    p_brand_slug: slug,
    p_limit: limit,
  });
  if (error) throw error;
  return data ?? [];
}

export async function fetchStorefrontSearch(brandId: string, term: string) {
  if (!term) return [];
  const escaped = term.replace(/[%_,()]/g, " ");
  const { data, error } = await supabase
    .from("products")
    .select(`
      id, name, name_ar, name_en, description, description_ar, description_en, category, image_url, media, brand_id, created_at,
      product_variants ( id, selling_price, original_price, stock_main )
    `)
    .eq("brand_id", brandId)
    .eq("is_active", true)
    .or(`name.ilike.%${escaped}%,name_ar.ilike.%${escaped}%,name_en.ilike.%${escaped}%,description.ilike.%${escaped}%,description_ar.ilike.%${escaped}%,description_en.ilike.%${escaped}%,category.ilike.%${escaped}%`);
  if (error) throw error;
  return data ?? [];
}
