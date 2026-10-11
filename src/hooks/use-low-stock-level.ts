import { useQuery } from "@tanstack/react-query";
import { businessSettingsQueries } from "@/lib/data/business-settings";
import { DEFAULT_LOW_STOCK_UNITS, lowStockLevel } from "@/lib/inventory-health";

/**
 * The store's own low-stock level (`business_settings.low_stock_threshold`), from the settings
 * row the admin already keeps in its cache; the default of 5 until it is known.
 */
export function useLowStockLevel(brandId: string): number {
  const { data } = useQuery({
    ...businessSettingsQueries.detail(brandId),
    enabled: Boolean(brandId),
  });
  return data ? lowStockLevel(data.low_stock_threshold) : DEFAULT_LOW_STOCK_UNITS;
}
