import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useBrand } from "@/lib/brand-context";
import { businessSettingsQueries } from "@/lib/data/business-settings";
import { storeColoursFrom } from "@/features/content-studio/lib/studio-styles";
import { useCardKit } from "@/features/gift-card-design/hooks/use-card-kit";

/** The store's card kit on its admin: the same colours, logo and kind its storefront draws with. */
export function useAdminCardKit() {
  const brand = useBrand();
  const settingsQ = useQuery(businessSettingsQueries.detail(brand.id));
  const settings = settingsQ.data as
    | {
        storefront_accent_color?: string | null;
        storefront_background_color?: string | null;
        storefront_text_color?: string | null;
        store_vertical?: string | null;
        currency?: string | null;
        logo_url?: string | null;
      }
    | null
    | undefined;
  const colours = useMemo(() => storeColoursFrom(settings, brand), [settings, brand]);
  return useCardKit({
    brandId: brand.id,
    slug: brand.slug,
    logo: settings?.logo_url || brand.logo_url,
    nameAr: brand.name_ar,
    nameEn: brand.name_en,
    colours,
    vertical: settings?.store_vertical ?? null,
    currency: settings?.currency ?? null,
  });
}
