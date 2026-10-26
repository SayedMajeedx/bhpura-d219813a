import { modulesFromAddons } from "@/lib/addons/addon-compat";
import type { BrandAddonRow } from "@/lib/addons/addon-types";
import {
  isServicesProfile,
  resolveStoreModules,
  type StoreProfileSource,
} from "@/lib/store-profile";

/** An add-on as the storefront's layout loads it. */
export type StorefrontAddon = {
  addon_id: string;
  status: string;
  public_settings: Record<string, unknown>;
};

/**
 * A storefront's modules: from its installed add-ons when it has any, else from its vertical and
 * its own module switches. One reading for the page (`useStoreModules`) and for what a loader or
 * a page's head decides before the page draws (a services store's listing title).
 */
export function storefrontModules(
  settings: StoreProfileSource | null | undefined,
  addons: readonly StorefrontAddon[] | null | undefined,
) {
  const source = {
    store_vertical: settings?.store_vertical,
    store_modules: settings?.store_modules,
  };
  if (addons && addons.length > 0) {
    const rows: BrandAddonRow[] = addons.map((a) => ({
      brand_id: "",
      addon_id: a.addon_id as BrandAddonRow["addon_id"],
      status: (a.status || "installed") as BrandAddonRow["status"],
      version: 1,
      settings: {},
      public_settings: a.public_settings || {},
      seeded_keys: [],
      source: "onboarding",
      installed_at: "",
      updated_at: "",
    }));
    return modulesFromAddons(rows, source);
  }
  return resolveStoreModules(source);
}

/** Whether a storefront is a services store (bookings, no stock, no shipping). */
export const isServicesStorefront = (
  settings: StoreProfileSource | null | undefined,
  addons: readonly StorefrontAddon[] | null | undefined,
) => isServicesProfile(storefrontModules(settings, addons));
