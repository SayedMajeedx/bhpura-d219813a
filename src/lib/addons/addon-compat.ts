import {
  resolveStoreModules,
  type StoreModules,
  type StoreProfileSource,
} from "@/lib/store-profile";
import type { BrandAddonRow } from "./addon-types";
import { isInstalled } from "./addon-registry";

/**
 * A store's modules when it has add-on records: the tailoring modules follow
 * their add-ons; the others (bookings and the core ones: stock, shipping…) are
 * not add-ons and follow the store's vertical and its own override (`profile`).
 */
export function modulesFromAddons(
  rows: BrandAddonRow[],
  profile?: StoreProfileSource | null,
): StoreModules {
  return {
    ...resolveStoreModules(profile),
    size_guide: isInstalled(rows, "size-guides"),
    fit_passport: isInstalled(rows, "fit-passport"),
    made_to_order: isInstalled(rows, "made-to-order"),
  };
}
