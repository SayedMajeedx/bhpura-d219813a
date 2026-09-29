import {
  resolveStoreModules,
  type StoreModules,
  type StoreProfileSource,
} from "@/lib/store-profile";
import type { BrandAddonRow } from "./addon-types";
import { isInstalled } from "./addon-registry";

/**
 * A store's modules when it has add-on records: the tailoring modules follow
 * their add-ons; bookings is not an add-on and follows the store's vertical
 * and its own override (`profile`).
 */
export function modulesFromAddons(
  rows: BrandAddonRow[],
  profile?: StoreProfileSource | null,
): StoreModules {
  return {
    size_guide: isInstalled(rows, "size-guides"),
    fit_passport: isInstalled(rows, "fit-passport"),
    made_to_order: isInstalled(rows, "made-to-order"),
    bookings: resolveStoreModules(profile).bookings,
  };
}
