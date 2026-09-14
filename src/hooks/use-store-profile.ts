import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import {
  normalizeVertical,
  resolveStoreModules,
  type StoreModules,
  type StoreVertical,
} from "@/lib/store-profile";
import { resolveFitProfiles, type FitProfileDefinition } from "@/lib/addons/addon-presets";
import { isInstalled } from "@/lib/addons/addon-registry";
import { modulesFromAddons } from "@/lib/addons/addon-compat";
import type { BrandAddonRow } from "@/lib/addons/addon-types";
import { useBrandAddons } from "@/hooks/use-brand-addons";

export type AdminStoreProfile = {
  vertical: StoreVertical;
  modules: StoreModules;
  storefrontMode: "shop" | "catalog";
  fitProfiles: FitProfileDefinition[];
  customFitProfiles?: FitProfileDefinition[] | null;
  addons?: BrandAddonRow[];
};

const TRANSITIONAL_FALLBACK: AdminStoreProfile = {
  vertical: "general",
  modules: resolveStoreModules({ store_vertical: "general" }),
  storefrontMode: "shop",
  fitProfiles: [],
  customFitProfiles: null,
  addons: [],
};

export function useAdminStoreProfile(brandId: string | null | undefined) {
  const { addons = [], isLoading: isAddonsLoading } = useBrandAddons(brandId);

  const q = useQuery({
    queryKey: queryKeys.brand.storeProfile(brandId ?? ""),
    enabled: Boolean(brandId),
    staleTime: 60_000,
    queryFn: async (): Promise<{
      storefront_mode: string | null;
      store_vertical: string | null;
      store_modules: unknown;
      fit_profiles: unknown;
    } | null> => {
      const { data, error } = await (supabase.from("business_settings") as any)
        .select("storefront_mode, store_vertical, store_modules, fit_profiles")
        .eq("brand_id", brandId!)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
  });

  const data = q.data;
  const vertical = normalizeVertical(data?.store_vertical ?? "general");
  const fallbackModules = resolveStoreModules({
    ...data,
    store_vertical: vertical,
  });

  // If brand has addon records, derive modules from installed addons; otherwise fallback to legacy resolution
  const modules = addons.length > 0 ? modulesFromAddons(addons) : fallbackModules;
  const hasFitPassport =
    addons.length > 0 ? isInstalled(addons, "fit-passport") : Boolean(fallbackModules.fit_passport);

  const profile: AdminStoreProfile = data
    ? {
        vertical,
        modules,
        storefrontMode: data?.storefront_mode === "catalog" ? "catalog" : "shop",
        fitProfiles: hasFitPassport ? resolveFitProfiles(data?.fit_profiles) : [],
        customFitProfiles: (data?.fit_profiles as FitProfileDefinition[] | null) ?? null,
        addons,
      }
    : TRANSITIONAL_FALLBACK;

  return { profile, isLoading: q.isLoading || isAddonsLoading };
}
