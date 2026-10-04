import { useQuery } from "@tanstack/react-query";
import { useBrand } from "@/lib/brand-context";
import { businessSettingsQueries } from "@/lib/data/business-settings";

/**
 * How the store looks, for the winner reveal: its logo (the one the storefront
 * uses, kept in the store's settings) and its brand colour.
 */
export function useStoreLook() {
  const brand = useBrand();
  const settings = useQuery(businessSettingsQueries.detail(brand.id)).data;
  return {
    logoUrl: settings?.logo_url ?? brand.logo_url ?? null,
    color: brand.primary_color ?? settings?.primary_color ?? null,
  };
}
