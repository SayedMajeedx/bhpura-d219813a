import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { STORE_VERTICALS, type StoreVertical } from "@/lib/store-profile";
import { syncBrandVerticalCategories } from "@/lib/addons/vertical-categories";

async function requireSuperAdmin(context: any) {
  const { data: isSuperAdmin, error } = await context.supabase.rpc("is_super_admin");
  if (error || !isSuperAdmin) {
    throw new Error("UNAUTHORIZED_SUPER_ADMIN_ONLY");
  }
}

const FinalizeBrandSetupInput = z.object({
  brandId: z.string().uuid(),
  storeVertical: z.enum(STORE_VERTICALS),
  logoUrl: z.string().nullable().optional(),
  faviconUrl: z.string().nullable().optional(),
});

export const finalizeBrandSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => FinalizeBrandSetupInput.parse(raw))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Update logo & favicon in settings and brands table
    const updatePayload: { logo_url?: string | null; favicon_url?: string | null } = {};
    if (data.logoUrl) {
      updatePayload.logo_url = data.logoUrl;
    }
    if (data.faviconUrl) {
      updatePayload.favicon_url = data.faviconUrl;
    }

    if (Object.keys(updatePayload).length > 0) {
      await Promise.all([
        supabaseAdmin
          .from("business_settings")
          .update(updatePayload)
          .eq("brand_id", data.brandId),
        data.logoUrl
          ? (supabaseAdmin.from("brands") as any)
              .update({ logo_url: data.logoUrl })
              .eq("id", data.brandId)
          : Promise.resolve(),
      ]);
    }

    // 2. Sync vertical categories
    const catResult = await syncBrandVerticalCategories({
      db: supabaseAdmin,
      brandId: data.brandId,
      newVertical: data.storeVertical,
      replaceEmptyOldCategories: true,
    });

    return {
      ok: true,
      categoriesInserted: catResult.insertedCount,
      categoriesRemoved: catResult.removedCount,
    };
  });
