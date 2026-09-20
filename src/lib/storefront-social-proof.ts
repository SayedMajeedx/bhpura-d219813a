import { publicSupabase as supabase } from "@/integrations/supabase/client";

/**
 * Fetches the real count of orders containing this product within the last 7 days.
 * To ensure trust and integrity, we only return a count if >= threshold (default 3).
 */
export async function getProductRecentPurchaseCount(
  brandId: string,
  productId: string,
  days = 7,
  threshold = 3,
): Promise<number | null> {
  try {
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);

    const { count, error } = await supabase
      .from("order_items")
      .select("id, orders!inner(brand_id, created_at, status)", { count: "exact", head: true })
      .eq("orders.brand_id", brandId)
      .eq("product_id", productId)
      .gte("orders.created_at", sinceDate.toISOString())
      .not("orders.status", "eq", "cancelled");

    if (error || typeof count !== "number") {
      return null;
    }

    if (count >= threshold) {
      return count;
    }

    return null;
  } catch {
    return null;
  }
}
