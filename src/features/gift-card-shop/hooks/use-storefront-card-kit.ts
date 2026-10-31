import { useMemo } from "react";
import { useStorefront } from "@/lib/storefront-context";
import { useCardKit } from "@/features/gift-card-design/hooks/use-card-kit";

/** The store's card kit on its own storefront: its colours, names, logo, kind and currency. */
export function useStorefrontCardKit() {
  const { brand, settings } = useStorefront();
  const colours = useMemo(
    () => ({
      accent: settings?.storefront_accent_color || brand.primary_color || null,
      background: settings?.background_color ?? null,
      text: settings?.text_color ?? null,
    }),
    [
      settings?.storefront_accent_color,
      settings?.background_color,
      settings?.text_color,
      brand.primary_color,
    ],
  );
  return useCardKit({
    brandId: brand.id,
    slug: brand.slug,
    logo: settings?.logo_url ?? brand.logo_url,
    nameAr: brand.name_ar,
    nameEn: brand.name_en,
    colours,
    vertical: settings?.store_vertical ?? null,
    currency: settings?.currency ?? null,
  });
}
