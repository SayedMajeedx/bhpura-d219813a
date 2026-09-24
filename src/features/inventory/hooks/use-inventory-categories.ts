import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { InventoryCategory } from "@/features/inventory/lib/product-list";

/** Active categories for the inventory filters and bulk category change (empty on error). */
export function useInventoryCategories(brandId: string) {
  return useQuery({
    queryKey: ["categories", brandId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("categories") as any)
        .select("id, name_en, name_ar, slug")
        .eq("brand_id", brandId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) return [];
      return (data ?? []) as InventoryCategory[];
    },
  });
}
