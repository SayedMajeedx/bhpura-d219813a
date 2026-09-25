import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { businessSettingsKeys } from "./keys";

export * from "./keys";
export * from "./mutations";

/**
 * A brand's `business_settings` row for admin screens (settings, order
 * editor, dashboard, expenses and reports). One key, one fetcher and the whole
 * row, so no screen can fill the cache with a narrower column list for the
 * others.
 */

/** The brand's settings row, or null when the brand has none yet. */
export async function fetchBusinessSettings(brandId: string) {
  const { data, error } = await supabase
    .from("business_settings")
    .select("*")
    .eq("brand_id", brandId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export type BusinessSettingsRow = NonNullable<Awaited<ReturnType<typeof fetchBusinessSettings>>>;

/** `business_settings.pages`: an old plain list, or the items with the footer titles. */
export type StoredPages =
  | Record<string, unknown>[]
  | {
      items?: Record<string, unknown>[];
      footer_titles?: {
        company_en?: string;
        company_ar?: string;
        help_en?: string;
        help_ar?: string;
      } | null;
    }
  | null;

export const businessSettingsQueries = {
  detail: (brandId: string) =>
    queryOptions({
      queryKey: businessSettingsKeys.detail(brandId),
      queryFn: () => fetchBusinessSettings(brandId),
      enabled: Boolean(brandId),
      staleTime: 60_000,
    }),
};
