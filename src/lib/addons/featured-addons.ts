import type { AddonId } from "./addon-types";
import type { StoreVertical } from "@/lib/store-profile";

/** Add-ons spotlighted in the store hero for each vertical (first = lead slide). */
const FEATURED_BY_VERTICAL: Partial<Record<StoreVertical, AddonId[]>> = {
  abayas: ["abaya-pack", "made-to-order", "size-guides"],
  fashion: ["fashion-core", "size-guides", "fit-passport"],
  beauty: ["beauty-perfume", "gifts", "digital-products"],
  jewelry: ["jewelry", "gifts", "made-to-order"],
  coffee: ["coffee-roastery", "gifts", "made-to-order"],
  food: ["food-beverage", "gifts", "digital-products"],
  gifts: ["gifts", "digital-products", "fashion-core"],
  print: ["print-stamps", "digital-products", "gifts"],
};

const FEATURED_DEFAULT: AddonId[] = ["size-guides", "made-to-order", "abaya-pack", "fit-passport"];

export function featuredAddonsFor(vertical: StoreVertical | string | null | undefined): AddonId[] {
  return (vertical && FEATURED_BY_VERTICAL[vertical as StoreVertical]) || FEATURED_DEFAULT;
}
