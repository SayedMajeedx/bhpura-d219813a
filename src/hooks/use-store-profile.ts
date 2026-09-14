import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import {
  normalizeVertical,
  resolveStoreModules,
  type StoreModules,
  type StoreVertical,
} from "@/lib/store-profile";

export type AdminStoreProfile = {
  vertical: StoreVertical;
  modules: StoreModules;
  storefrontMode: "shop" | "catalog";
};

const TRANSITIONAL_FALLBACK: AdminStoreProfile = {
  vertical: "fashion",
  modules: resolveStoreModules({ store_vertical: "fashion" }),
  storefrontMode: "shop",
};

export function useAdminStoreProfile(brandId: string | null | undefined) {
  const q = useQuery({
    queryKey: queryKeys.brand.storeProfile(brandId ?? ""),
    enabled: Boolean(brandId),
    staleTime: 60_000,
    queryFn: async (): Promise<AdminStoreProfile> => {
      const { data, error } = await (supabase.from("business_settings") as any)
        .select("storefront_mode, store_vertical, store_modules")
        .eq("brand_id", brandId!)
        .maybeSingle();
      if (error) throw error;
      return {
        vertical: normalizeVertical(data?.store_vertical ?? "fashion"),
        modules: resolveStoreModules({
          ...data,
          store_vertical: data?.store_vertical ?? "fashion",
        }),
        storefrontMode: data?.storefront_mode === "catalog" ? "catalog" : "shop",
      };
    },
  });
  return { profile: q.data ?? TRANSITIONAL_FALLBACK, isLoading: q.isLoading };
}
