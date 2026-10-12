import type { supabaseAdmin } from "@/integrations/supabase/client.server";
import { readAll } from "@/lib/data/read-all";

/**
 * Every variant of a brand, as the public API's inventory endpoint answers it. An API client is
 * not told when a list was cut at the row limit, so the list is read to its end.
 */
export function readBrandInventory(db: typeof supabaseAdmin, brandId: string) {
  return readAll((from, to) =>
    db
      .from("product_variants")
      .select("id, product_id, sku, selling_price, stock, products!inner(brand_id, name)", {
        count: "exact",
      })
      .eq("products.brand_id", brandId)
      .order("id")
      .range(from, to),
  );
}
