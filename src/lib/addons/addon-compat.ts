import type { StoreModules } from "@/lib/store-profile";
import type { BrandAddonRow } from "./addon-types";
import { isInstalled } from "./addon-registry";

export function modulesFromAddons(rows: BrandAddonRow[]): StoreModules {
  return {
    size_guide: isInstalled(rows, "size-guides"),
    fit_passport: isInstalled(rows, "fit-passport"),
    made_to_order: isInstalled(rows, "made-to-order"),
  };
}
