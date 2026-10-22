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

/**
 * Saves the Pages screen's columns and returns what the database stored. A
 * write that matches no row (policy, wrong brand) comes back empty, and that
 * is an error here, not a quiet success.
 */
export async function savePagesSettings(
  brandId: string,
  patch: Pick<BusinessSettingsPatch, "pages" | "socials">,
) {
  const { data, error } = await supabase
    .from("business_settings")
    .update(patch)
    .eq("brand_id", brandId)
    .select("pages, socials")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("PAGES_NOT_SAVED");
  return data;
}

/**
 * The store's own low-stock level, set from the inventory page. Returns what the database
 * stored; a write that matched no row (the member may not change settings) is an error, not a
 * quiet success.
 */
/**
 * Saves the store's thank-you discount for a review: one of its promo codes, or none. Fails on a
 * write that changed nothing (no settings row, or one the member may not change).
 */
export async function saveReviewReward(brandId: string, promoId: string | null) {
  const { data, error } = await supabase
    .from("business_settings")
    .update({ review_reward_promo_id: promoId })
    .eq("brand_id", brandId)
    .select("review_reward_promo_id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("REVIEW_REWARD_NOT_SAVED");
  return data.review_reward_promo_id;
}

export async function saveLowStockLevel(brandId: string, level: number) {
  const { data, error } = await supabase
    .from("business_settings")
    .update({ low_stock_threshold: level })
    .eq("brand_id", brandId)
    .select("low_stock_threshold")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("LOW_STOCK_LEVEL_NOT_SAVED");
  return data.low_stock_threshold;
}
