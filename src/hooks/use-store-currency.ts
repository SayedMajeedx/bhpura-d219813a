import { useQuery } from "@tanstack/react-query";
import { businessSettingsQueries } from "@/lib/data/business-settings";
import { useBrandOptional } from "@/lib/brand-context";
import { currencyLabel } from "@/lib/currency-label";

/** What a store's money is written in until its settings are known (and for a store that set none). */
export const DEFAULT_STORE_CURRENCY = "BHD";

/**
 * The store's own currency (`business_settings.currency`), from the settings row the admin
 * already keeps in its cache. Money on an admin screen is written in it: the accounting tabs,
 * returns and a customer's page once wrote "BHD" whatever the store's currency was.
 */
export function useStoreCurrency(brandId: string | null | undefined): string {
  const { data } = useQuery({
    ...businessSettingsQueries.detail(brandId ?? ""),
    enabled: Boolean(brandId),
  });
  return data?.currency || DEFAULT_STORE_CURRENCY;
}

/**
 * The currency's name for a label or beside a field ("BHD", "د.ب"), for the store whose admin
 * is open. For a form that says what its amount is in: "Price (BHD)".
 */
export function useMoneyLabel(lang: "ar" | "en"): string {
  return currencyLabel(useStoreCurrency(useBrandOptional()?.id), lang);
}
