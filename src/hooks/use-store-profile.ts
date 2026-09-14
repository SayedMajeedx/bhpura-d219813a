import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import {
  normalizeVertical,
  resolveStoreModules,
  type StoreModules,
  type StoreVertical,
} from "@/lib/store-profile";
import {
  resolveFitProfiles,
  type FitProfileDefinition,
  FASHION_FIT_PROFILES,
} from "@/lib/fit-passport";

import { modulesFromAddons } from "@/lib/addons/addon-compat";
import type { BrandAddonRow } from "@/lib/addons/addon-types";

export type AdminStoreProfile = {
  vertical: StoreVertical;
  modules: StoreModules;
  storefrontMode: "shop" | "catalog";
  fitProfiles: FitProfileDefinition[];
  addons?: BrandAddonRow[];
};

const TRANSITIONAL_FALLBACK: AdminStoreProfile = {
  vertical: "abayas",
  modules: resolveStoreModules({ store_vertical: "abayas" }),
  storefrontMode: "shop",
  fitProfiles: FASHION_FIT_PROFILES,
  addons: [],
};

export function useAdminStoreProfile(brandId: string | null | undefined) {
  const q = useQuery({
    queryKey: queryKeys.brand.storeProfile(brandId ?? ""),
    enabled: Boolean(brandId),
    staleTime: 60_000,
    queryFn: async (): Promise<AdminStoreProfile> => {
      const [settingsRes, addonsRes] = await Promise.all([
        (supabase.from("business_settings") as any)
          .select("storefront_mode, store_vertical, store_modules, fit_profiles")
          .eq("brand_id", brandId!)
          .maybeSingle(),
        (supabase as any).from("brand_addons").select("*").eq("brand_id", brandId!),
      ]);

      if (settingsRes.error) throw settingsRes.error;
      const data = settingsRes.data;
      const addons = (addonsRes.data || []) as BrandAddonRow[];

      const vertical = normalizeVertical(data?.store_vertical ?? "abayas");
      const fallbackModules = resolveStoreModules({
        ...data,
        store_vertical: vertical,
      });

      // If brand has addon records, derive modules from installed addons; otherwise fallback to legacy resolution
      const modules = addons.length > 0 ? modulesFromAddons(addons) : fallbackModules;

      return {
        vertical,
        modules,
        storefrontMode: data?.storefront_mode === "catalog" ? "catalog" : "shop",
        fitProfiles: resolveFitProfiles(data?.fit_profiles),
        addons,
      };
    },
  });
  return { profile: q.data ?? TRANSITIONAL_FALLBACK, isLoading: q.isLoading };
}
