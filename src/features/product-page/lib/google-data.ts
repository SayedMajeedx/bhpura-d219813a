import type { StoreLayoutData } from "@/features/storefront-shell/lib/layout-data";
import { isServicesStorefront } from "@/lib/storefront-modules";

/**
 * What the product page's loader takes from the store's layout for the page's Google data
 * (`productHead`): the store's currency and kind, whether it shows prices at all, how it delivers
 * and the pages it wrote (its return policy is read with the product). One place, so the route
 * stays a loader and a page.
 */
export function productGoogleData(layout: StoreLayoutData) {
  const settings = layout.settings;
  return {
    currency: settings?.currency ?? null,
    vertical: settings?.store_vertical ?? null,
    servicesStore: isServicesStorefront(settings, layout.bootstrapData?.addons),
    showPrices: !(
      settings?.storefront_mode === "catalog" && settings?.catalog_show_prices === false
    ),
    delivery: {
      delivery_enabled: settings?.delivery_enabled,
      delivery_fee: settings?.delivery_fee,
      currency: settings?.currency,
      shipping_zones: settings?.shipping_zones,
    },
    pages: settings?.pages ?? [],
  };
}
