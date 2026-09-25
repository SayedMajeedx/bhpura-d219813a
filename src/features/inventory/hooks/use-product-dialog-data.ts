import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { categoriesQueries } from "@/lib/data/categories";
import { useAddons } from "@/components/addons/AddonsProvider";
import { useAdminStoreProfile } from "@/hooks/use-store-profile";
import { CUSTOMIZER_PRESETS } from "@/lib/addons/addon-presets";
import { customFieldPresetsFrom, variantAxisDefaultsFrom } from "@/lib/addons/addon-registry";

/**
 * What the product editor reads besides the product: the store profile and
 * addons (axis labels, customizer presets), active categories and size guides.
 */
export function useProductDialogData(brandId: string) {
  const { profile: storeProfile } = useAdminStoreProfile(brandId);
  const { addons } = useAddons();
  const addonAxisDefaults = useMemo(
    () => variantAxisDefaultsFrom(addons.length > 0 ? addons : storeProfile?.addons),
    [addons, storeProfile?.addons],
  );
  const customFieldPresets = useMemo(() => {
    const fromAddons = customFieldPresetsFrom(addons.length > 0 ? addons : storeProfile?.addons);
    if (fromAddons.length > 0) return fromAddons;
    return Object.entries(CUSTOMIZER_PRESETS).map(([k, p]) => ({
      key: k,
      label: { ar: p.label_ar, en: p.label_en },
      fields: p.fields,
    }));
  }, [addons, storeProfile?.addons]);

  const categoriesQ = useQuery(categoriesQueries.active(brandId));

  const sizeGuidesQ = useQuery({
    queryKey: ["admin-size-guides-list", brandId],
    enabled: Boolean(storeProfile?.modules?.size_guide),
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("size_guides")
        .select("id, name_ar, name_en, is_default")
        .eq("brand_id", brandId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      return (data ?? []) as Array<{
        id: string;
        name_ar: string;
        name_en: string;
        is_default: boolean;
      }>;
    },
  });

  return {
    storeProfile,
    addons,
    addonAxisDefaults,
    customFieldPresets,
    categoriesQ,
    sizeGuidesQ,
  };
}

export type ProductDialogData = ReturnType<typeof useProductDialogData>;
