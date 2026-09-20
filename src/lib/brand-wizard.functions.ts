import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { STORE_VERTICALS } from "@/lib/store-profile";
import { syncBrandVerticalCategories } from "@/lib/addons/vertical-categories";
import { PALETTE_SETTINGS_COLUMNS } from "@/lib/brand-palette-apply";

async function requireSuperAdmin(context: any) {
  const { data: isSuperAdmin, error } = await context.supabase.rpc("is_super_admin");
  if (error || !isSuperAdmin) {
    throw new Error("UNAUTHORIZED_SUPER_ADMIN_ONLY");
  }
}

/**
 * Columns the wizard may write after provisioning. Anything else in `settingsPatch`
 * is dropped server-side so the client cannot smuggle arbitrary updates.
 */
const FINALIZE_SETTINGS_COLUMNS = new Set<string>([
  ...PALETTE_SETTINGS_COLUMNS,
  "storefront_design_version",
  "storefront_radius",
  "trust_bar_enabled",
  "trust_bar_position",
  "footer_layout",
  "brand_story_enabled",
  "motion_enabled",
  "product_card_hover_image",
  "product_card_color_dots",
  "product_card_quick_add",
  "category_filters_enabled",
  "pdp_layout",
  "pdp_image_zoom",
  "quick_view_enabled",
  "social_proof_enabled",
  "recently_viewed_enabled",
  "newsletter_enabled",
  "back_in_stock_enabled",
]);

const HEX = /^#[0-9a-f]{6}$/i;

const FinalizeBrandSetupInput = z.object({
  brandId: z.string().uuid(),
  storeVertical: z.enum(STORE_VERTICALS),
  logoUrl: z.string().url().nullable().optional(),
  faviconUrl: z.string().url().nullable().optional(),
  settingsPatch: z.record(z.string(), z.unknown()).optional(),
  installStarterPack: z.boolean().optional(),
});

export const finalizeBrandSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => FinalizeBrandSetupInput.parse(raw))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Logo / favicon + whitelisted settings (derived palette, design version, template design)
    const updatePayload: Record<string, unknown> = {};
    if (data.logoUrl) updatePayload.logo_url = data.logoUrl;
    if (data.faviconUrl) updatePayload.favicon_url = data.faviconUrl;
    for (const [key, value] of Object.entries(data.settingsPatch ?? {})) {
      if (!FINALIZE_SETTINGS_COLUMNS.has(key)) continue;
      if (key.endsWith("_color") || key.endsWith("_bg") || key.endsWith("_fg")) {
        if (typeof value !== "string" || !HEX.test(value)) continue;
      }
      updatePayload[key] = value;
    }

    if (Object.keys(updatePayload).length > 0) {
      const { error: bsError } = await (supabaseAdmin.from("business_settings") as any)
        .update({ ...updatePayload, updated_at: new Date().toISOString() })
        .eq("brand_id", data.brandId);
      if (bsError) throw bsError;
    }
    if (data.logoUrl) {
      const { error: brandError } = await (supabaseAdmin.from("brands") as any)
        .update({ logo_url: data.logoUrl, updated_at: new Date().toISOString() })
        .eq("id", data.brandId);
      if (brandError) throw brandError;
    }

    // 2. Starter-pack add-ons for the vertical (fashion-core, size guides, etc.)
    let addonsInstalled: string[] = [];
    if (data.installStarterPack !== false) {
      const { installStarterPack } = await import("@/lib/addons/addons.functions");
      const result = await installStarterPack({
        data: { brandId: data.brandId, activity: data.storeVertical },
      });
      addonsInstalled = result.installed;
    }

    // 3. Sync vertical categories
    const catResult = await syncBrandVerticalCategories({
      db: supabaseAdmin,
      brandId: data.brandId,
      newVertical: data.storeVertical,
      replaceEmptyOldCategories: true,
    });

    return {
      ok: true,
      addonsInstalled,
      categoriesInserted: catResult.insertedCount,
      categoriesRemoved: catResult.removedCount,
    };
  });
