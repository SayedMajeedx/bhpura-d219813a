import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { businessSettingsKeys } from "./keys";

/**
 * Writes to a brand's `business_settings` row. The settings form sends only
 * the changed columns (see `settings-registry-single-source`); the Pages
 * screen, the packaging tab and the store profile card write their own
 * columns. Every write is scoped by brand and throws on error. After a write,
 * call `invalidateBusinessSettings`.
 */

export type BusinessSettingsPatch = Omit<TablesUpdate<"business_settings">, "brand_id">;

/** The settings row and the store profile read from it are stale after a write. */
export function invalidateBusinessSettings(qc: QueryClient, brandId: string) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: businessSettingsKeys.detail(brandId) }),
    qc.invalidateQueries({ queryKey: businessSettingsKeys.storeProfile(brandId) }),
  ]);
}

/**
 * Writes columns of the brand's settings row, creating the row when the brand
 * has none yet (upsert on `brand_id`).
 */
export async function saveBusinessSettings(brandId: string, patch: BusinessSettingsPatch) {
  const { error } = await supabase
    .from("business_settings")
    .upsert({ ...patch, brand_id: brandId }, { onConflict: "brand_id" });
  if (error) throw error;
}

/** Changes columns of the brand's existing settings row. */
export async function updateBusinessSettings(brandId: string, patch: BusinessSettingsPatch) {
  const { error } = await supabase.from("business_settings").update(patch).eq("brand_id", brandId);
  if (error) throw error;
}
