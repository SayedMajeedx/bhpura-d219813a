import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Active couriers of the brand, by name, for assignment menus. */
export function useBrandCouriers(brandId: string) {
  return useQuery({
    queryKey: ["couriers", brandId],
    enabled: Boolean(brandId),
    queryFn: async () => {
      const { data, error } = await (supabase.from("profiles") as any)
        .select("id, name, email, phone")
        .eq("brand_id", brandId)
        .eq("role", "courier")
        .eq("status", "active")
        .order("name");
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });
}
