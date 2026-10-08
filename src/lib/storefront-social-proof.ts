import { publicSupabase as supabase } from "@/integrations/supabase/client";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * How many orders of the last 7 days contained this product, for the product page's "Purchased N
 * times" badge. The database answers only at or above its threshold (3) and only for a store that
 * keeps the badge on; otherwise this is null. It never rejects: no badge is better than a broken
 * page.
 */
export async function getProductRecentPurchaseCount(
  brandSlug: string,
  productId: string,
): Promise<number | null> {
  if (!brandSlug || !UUID.test(productId)) return null;
  try {
    const { data, error } = await supabase.rpc("get_product_recent_purchase_count", {
      p_brand_slug: brandSlug,
      p_product_id: productId,
    });
    return error || typeof data !== "number" ? null : data;
  } catch {
    return null;
  }
}
