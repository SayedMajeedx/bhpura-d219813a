import { getAddon } from "@/lib/addons/addon-registry";
import type { AddonId } from "@/lib/addons/addon-types";
import { resolveVocabulary, type StoreVocabulary } from "@/lib/store-vocabulary";

export type BrandAiContext = {
  brandId: string;
  brandName: string;
  vertical: string;
  installedAddonIds: AddonId[];
  systemPrompts: string[];
  vocabulary: StoreVocabulary;
  combinedSystemPrompt: string;
};

/**
 * Aggregates AI context contributions from all installed add-ons for the brand
 * so AI features (copilot, assistant) speak the brand's language without hardcoding fashion terms.
 */
export async function getBrandAiContext(
  brandId: string,
  options?: { lang?: "ar" | "en" },
): Promise<BrandAiContext> {
  const lang = options?.lang || "ar";
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // 1. Fetch brand details & installed add-ons
  const [brandRes, addonsRes] = await Promise.all([
    (supabaseAdmin as any)
      .from("brands")
      .select("id, name_ar, name_en, store_vertical")
      .eq("id", brandId)
      .maybeSingle(),
    (supabaseAdmin as any)
      .from("brand_addons")
      .select("addon_id")
      .eq("brand_id", brandId)
      .eq("status", "installed"),
  ]);

  const brand = brandRes.data;
  const brandName =
    lang === "ar"
      ? brand?.name_ar || brand?.name_en || "المتجر"
      : brand?.name_en || brand?.name_ar || "Store";
  const vertical = brand?.store_vertical || "general";

  const installedAddonIds = (addonsRes.data ?? []).map(
    (row: { addon_id: string }) => row.addon_id as AddonId,
  );

  const systemPrompts: string[] = [];
  const vocabOverrides: any[] = [];

  for (const addonId of installedAddonIds) {
    let manifest;
    try {
      manifest = getAddon(addonId);
    } catch {
      continue;
    }

    if (manifest.contributions?.aiContext) {
      try {
        const text = manifest.contributions.aiContext({ brandName, lang });
        if (text?.trim()) {
          systemPrompts.push(text.trim());
        }
      } catch (err) {
        console.warn(`[getBrandAiContext] failed to generate aiContext for addon ${addonId}:`, err);
      }
    }

    if (manifest.contributions?.vocabulary) {
      vocabOverrides.push(manifest.contributions.vocabulary);
    }
  }

  const vocabulary = resolveVocabulary(undefined, ...vocabOverrides);

  const basePrompt =
    lang === "ar"
      ? `أنت مساعد ذكي لمتجر "${brandName}". نوع النشاط: ${vertical}.`
      : `You are an AI assistant for "${brandName}". Store activity: ${vertical}.`;

  const combinedSystemPrompt = [basePrompt, ...systemPrompts].join("\n\n");

  return {
    brandId,
    brandName,
    vertical,
    installedAddonIds,
    systemPrompts,
    vocabulary,
    combinedSystemPrompt,
  };
}
