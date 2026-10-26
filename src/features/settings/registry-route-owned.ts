import type { SettingsFieldDef } from "@/features/settings/registry";
import { INVENTORY_SETTINGS } from "@/features/settings/registry-inventory";
import { OFFERS_SETTINGS } from "@/features/settings/registry-offers";
import { REVIEWS_SETTINGS } from "@/features/settings/registry-reviews";
import { STORE_STATUS_SETTINGS } from "@/features/settings/registry-store-status";

/**
 * The settings another admin page owns and saves (the inventory, reviews and discounts pages,
 * and the dashboard's busy pause),
 * gathered here so the registry file does not grow with each.
 */
export const ROUTE_OWNED_SETTINGS: SettingsFieldDef[] = [
  ...INVENTORY_SETTINGS,
  ...REVIEWS_SETTINGS,
  ...OFFERS_SETTINGS,
  ...STORE_STATUS_SETTINGS,
];
