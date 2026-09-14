import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AddonId, BrandAddonRow, PlatformAddonPolicy, BrandAddonEvent } from "./addon-types";
import { getAddon, resolveInstallOrder, dependentsOf, starterPackFor } from "./addon-registry";
import type { StoreVertical } from "@/lib/store-profile";

async function requireBrandAccess(context: any, brandId: string) {
  const db = context.supabase as any;
  const { data: hasAccess } = await db.rpc("can_access_brand", {
    _brand_id: brandId,
  });
  if (!hasAccess) {
    const { data: isSuperAdmin } = await db.rpc("is_super_admin");
    if (!isSuperAdmin) {
      try {
        const { readImpersonationCookie, verifyImpersonationToken } =
          await import("@/lib/impersonation-cookies.server");
        const token = await readImpersonationCookie();
        const payload = await verifyImpersonationToken(token);
        if (payload && payload.targetTenantId === brandId) {
          return;
        }
      } catch {
        // Fall through to deny
      }
      throw new Error("UNAUTHORIZED_BRAND_ACCESS_DENIED");
    }
  }
}

/**
 * 1. Get all installed/configured addons for a brand
 */
export const getInstalledAddons = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      brandId: z.string().uuid(),
    }),
  )
  .handler(async ({ data, context }) => {
    await requireBrandAccess(context, data.brandId);
    const db = context.supabase as any;

    const { data: rows, error } = await db
      .from("brand_addons")
      .select("*")
      .eq("brand_id", data.brandId);

    if (error) {
      throw new Error(`FAILED_TO_FETCH_BRAND_ADDONS: ${error.message}`);
    }

    return (rows || []) as BrandAddonRow[];
  });

export const listBrandAddons = getInstalledAddons;

/**
 * 2. Install an addon (handles policy check, topological dependencies, seeds, and audit event)
 */
export const installAddon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      brandId: z.string().uuid(),
      addonId: z.string(),
      source: z.enum(["onboarding", "manual", "super_admin", "migration"]).optional(),
      withDependencies: z.boolean().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    await requireBrandAccess(context, data.brandId);
    const db = context.supabase as any;
    const targetAddonId = data.addonId as AddonId;
    const source = data.source || "manual";

    // 1. Check platform policy
    const { data: policy } = await db
      .from("platform_addon_policies")
      .select("*")
      .eq("addon_id", targetAddonId)
      .maybeSingle();

    if (policy) {
      if (policy.availability === "deprecated") {
        throw new Error("ADDON_DEPRECATED");
      }
      if (policy.availability === "beta" || policy.availability === "internal") {
        const allowed =
          Array.isArray(policy.allowed_brand_ids) &&
          policy.allowed_brand_ids.includes(data.brandId);
        if (!allowed) {
          const { data: isSuperAdmin } = await db.rpc("is_super_admin");
          if (!isSuperAdmin) {
            throw new Error("ADDON_NOT_AVAILABLE_FOR_BRAND");
          }
        }
      }
    }

    // 2. Fetch existing brand addons to know what's already installed
    const { data: existingRows } = await db
      .from("brand_addons")
      .select("*")
      .eq("brand_id", data.brandId);

    const installedMap = new Map<string, BrandAddonRow>(
      (existingRows || []).map((r: BrandAddonRow) => [r.addon_id, r]),
    );

    // 3. Resolve topological install order including dependencies
    const toInstall = resolveInstallOrder([targetAddonId]);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    for (const id of toInstall) {
      const manifest = getAddon(id);
      const existing = installedMap.get(id);

      if (existing && existing.status === "installed") {
        continue;
      }

      // Apply settingsPatchOnInstall if provided and not previously installed
      if (!existing && manifest.contributions.settingsPatchOnInstall) {
        await (supabaseAdmin.from("business_settings") as any)
          .update(manifest.contributions.settingsPatchOnInstall)
          .eq("brand_id", data.brandId);
      }

      // Run unexecuted seeds
      const seededKeys = new Set<string>(existing?.seeded_keys || []);
      if (manifest.seeds && manifest.seeds.length > 0) {
        for (const seed of manifest.seeds) {
          if (!seededKeys.has(seed.key)) {
            try {
              await seed.run({
                brandId: data.brandId,
                db: supabaseAdmin,
                lang: "ar",
                settings: existing?.settings || {},
              });
              seededKeys.add(seed.key);
            } catch (err: any) {
              console.error(`[Addons] Seed '${seed.key}' failed for brand '${data.brandId}':`, err);
              throw new Error(`SEED_FAILED_${seed.key}: ${err.message}`);
            }
          }
        }
      }

      // Upsert brand_addons record
      const { error: upsertErr } = await db.from("brand_addons").upsert(
        {
          brand_id: data.brandId,
          addon_id: id,
          status: "installed",
          version: manifest.version,
          settings: existing?.settings || {},
          public_settings: existing?.public_settings || {},
          seeded_keys: Array.from(seededKeys),
          source,
          installed_at: existing?.installed_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "brand_id,addon_id" },
      );

      if (upsertErr) {
        throw new Error(`FAILED_TO_INSTALL_ADDON_${id}: ${upsertErr.message}`);
      }

      // Log event
      await db.from("brand_addon_events").insert({
        brand_id: data.brandId,
        addon_id: id,
        action: "install",
        actor_user_id: (context as any).userId || null,
        source,
        details: { addonId: id, direct: id === targetAddonId },
      });
    }

    return { success: true };
  });

/**
 * 3. Disable an installed addon (fails if any installed addon depends on it)
 */
export const disableAddon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      brandId: z.string().uuid(),
      addonId: z.string(),
    }),
  )
  .handler(async ({ data, context }) => {
    await requireBrandAccess(context, data.brandId);
    const db = context.supabase as any;
    const targetAddonId = data.addonId as AddonId;

    const { data: rows } = await db
      .from("brand_addons")
      .select("addon_id, status")
      .eq("brand_id", data.brandId)
      .eq("status", "installed");

    const installedIds = (rows || []).map((r: any) => r.addon_id as AddonId);
    const dependents = dependentsOf(targetAddonId, installedIds);

    if (dependents.length > 0) {
      throw new Error(`CANNOT_DISABLE_HAS_DEPENDENTS: ${dependents.join(", ")}`);
    }

    const { error } = await db
      .from("brand_addons")
      .update({
        status: "disabled",
        updated_at: new Date().toISOString(),
      })
      .eq("brand_id", data.brandId)
      .eq("addon_id", targetAddonId);

    if (error) {
      throw new Error(`FAILED_TO_DISABLE_ADDON: ${error.message}`);
    }

    await db.from("brand_addon_events").insert({
      brand_id: data.brandId,
      addon_id: targetAddonId,
      action: "disable",
      actor_user_id: (context as any).userId || null,
      source: "manual",
      details: {},
    });

    return { success: true };
  });

/**
 * 4. Enable a previously disabled addon
 */
export const enableAddon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      brandId: z.string().uuid(),
      addonId: z.string(),
    }),
  )
  .handler(async ({ data, context }) => {
    await requireBrandAccess(context, data.brandId);
    const db = context.supabase as any;
    const targetAddonId = data.addonId as AddonId;
    const manifest = getAddon(targetAddonId);

    // Verify dependencies are installed & active
    if (manifest.requires && manifest.requires.length > 0) {
      const { data: rows } = await db
        .from("brand_addons")
        .select("addon_id")
        .eq("brand_id", data.brandId)
        .eq("status", "installed")
        .in("addon_id", manifest.requires);

      const installedReqs = new Set((rows || []).map((r: any) => r.addon_id));
      const missing = manifest.requires.filter((req) => !installedReqs.has(req));
      if (missing.length > 0) {
        throw new Error(`CANNOT_ENABLE_MISSING_DEPENDENCIES: ${missing.join(", ")}`);
      }
    }

    const { error } = await db
      .from("brand_addons")
      .update({
        status: "installed",
        updated_at: new Date().toISOString(),
      })
      .eq("brand_id", data.brandId)
      .eq("addon_id", targetAddonId);

    if (error) {
      throw new Error(`FAILED_TO_ENABLE_ADDON: ${error.message}`);
    }

    await db.from("brand_addon_events").insert({
      brand_id: data.brandId,
      addon_id: targetAddonId,
      action: "enable",
      actor_user_id: (context as any).userId || null,
      source: "manual",
      details: {},
    });

    return { success: true };
  });

/**
 * 5. Uninstall an addon (with optional purge of merchant business data)
 */
export const uninstallAddon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      brandId: z.string().uuid(),
      addonId: z.string(),
      purge: z.boolean().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    await requireBrandAccess(context, data.brandId);
    const db = context.supabase as any;
    const targetAddonId = data.addonId as AddonId;

    const { data: rows } = await db
      .from("brand_addons")
      .select("addon_id, settings")
      .eq("brand_id", data.brandId)
      .eq("status", "installed");

    const installedIds = (rows || []).map((r: any) => r.addon_id as AddonId);
    const dependents = dependentsOf(targetAddonId, installedIds);

    if (dependents.length > 0) {
      throw new Error(`CANNOT_REMOVE_HAS_DEPENDENTS: ${dependents.join(", ")}`);
    }

    const currentRow = (rows || []).find((r: any) => r.addon_id === targetAddonId);

    // If purge requested, run manifest.purge via supabaseAdmin
    if (data.purge) {
      const manifest = getAddon(targetAddonId);
      if (manifest.purge) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await manifest.purge({
          brandId: data.brandId,
          db: supabaseAdmin,
          lang: "ar",
          settings: currentRow?.settings || {},
        });
      }
    }

    const { error } = await db
      .from("brand_addons")
      .delete()
      .eq("brand_id", data.brandId)
      .eq("addon_id", targetAddonId);

    if (error) {
      throw new Error(`FAILED_TO_REMOVE_ADDON: ${error.message}`);
    }

    await db.from("brand_addon_events").insert({
      brand_id: data.brandId,
      addon_id: targetAddonId,
      action: data.purge ? "purge" : "remove",
      actor_user_id: (context as any).userId || null,
      source: "manual",
      details: { purged: Boolean(data.purge) },
    });

    return { success: true };
  });

/** Legacy alias for uninstallAddon without purge */
export const removeAddon = uninstallAddon;

/**
 * 6. Update addon settings and sync public_settings
 */
export const updateAddonSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      brandId: z.string().uuid(),
      addonId: z.string(),
      settings: z.record(z.unknown()),
    }),
  )
  .handler(async ({ data, context }) => {
    await requireBrandAccess(context, data.brandId);
    const db = context.supabase as any;
    const targetAddonId = data.addonId as AddonId;
    const manifest = getAddon(targetAddonId);

    const publicSettings: Record<string, unknown> = {};
    if (manifest.settingsSchema) {
      for (const field of manifest.settingsSchema) {
        if (field.public && field.key in data.settings) {
          publicSettings[field.key] = data.settings[field.key];
        }
      }
    }

    const { error } = await db
      .from("brand_addons")
      .update({
        settings: data.settings,
        public_settings: publicSettings,
        updated_at: new Date().toISOString(),
      })
      .eq("brand_id", data.brandId)
      .eq("addon_id", targetAddonId);

    if (error) {
      throw new Error(`FAILED_TO_UPDATE_SETTINGS: ${error.message}`);
    }

    return { success: true };
  });

/**
 * 7. Set Addon Status (enable/disable)
 */
export const setAddonStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      brandId: z.string().uuid(),
      addonId: z.string(),
      status: z.enum(["installed", "disabled"]),
    }),
  )
  .handler(async ({ data }) => {
    if (data.status === "disabled") {
      return await disableAddon({
        data: {
          brandId: data.brandId,
          addonId: data.addonId,
        },
      });
    } else {
      return await enableAddon({
        data: {
          brandId: data.brandId,
          addonId: data.addonId,
        },
      });
    }
  });

/**
 * 8. Upgrade brand addons (executes any pending upgrades & seeds)
 */
export const upgradeBrandAddons = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      brandId: z.string().uuid(),
    }),
  )
  .handler(async ({ data, context }) => {
    await requireBrandAccess(context, data.brandId);
    const db = context.supabase as any;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows } = await db.from("brand_addons").select("*").eq("brand_id", data.brandId);

    const upgraded: string[] = [];

    for (const row of rows || []) {
      const manifest = getAddon(row.addon_id as AddonId);
      if (manifest && row.version < manifest.version) {
        // Execute pending upgrades if defined
        if (manifest.upgrades) {
          for (const upgrade of manifest.upgrades) {
            if (upgrade.toVersion > row.version && upgrade.toVersion <= manifest.version) {
              for (const seed of upgrade.seeds) {
                await seed.run({
                  brandId: data.brandId,
                  db: supabaseAdmin,
                  lang: "ar",
                  settings: row.settings || {},
                });
              }
            }
          }
        }

        await db
          .from("brand_addons")
          .update({
            version: manifest.version,
            updated_at: new Date().toISOString(),
          })
          .eq("brand_id", data.brandId)
          .eq("addon_id", row.addon_id);

        await db.from("brand_addon_events").insert({
          brand_id: data.brandId,
          addon_id: row.addon_id,
          action: "upgrade",
          actor_user_id: (context as any).userId || null,
          source: "manual",
          details: { fromVersion: row.version, toVersion: manifest.version },
        });

        upgraded.push(row.addon_id);
      }
    }

    return { success: true, upgraded };
  });

/**
 * 9. Install Starter Pack for a vertical
 */
export const installStarterPack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      brandId: z.string().uuid(),
      activity: z.string(),
      selectedAddonIds: z.array(z.string()).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    await requireBrandAccess(context, data.brandId);
    const pack = starterPackFor(data.activity as StoreVertical);
    const combined = Array.from(new Set([...pack.required, ...(data.selectedAddonIds || [])]));

    const installed: string[] = [];
    for (const addonId of combined) {
      await installAddon({
        data: {
          brandId: data.brandId,
          addonId,
          source: "onboarding",
          withDependencies: true,
        },
      });
      installed.push(addonId);
    }

    return { success: true, installed };
  });

/** Legacy alias */
export const applyStarterPack = installStarterPack;

/**
 * 10. Get brand add-on event audit log
 */
export const getBrandAddonEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      brandId: z.string().uuid(),
      limit: z.number().int().positive().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    await requireBrandAccess(context, data.brandId);
    const db = context.supabase as any;

    const { data: events, error } = await db
      .from("brand_addon_events")
      .select("*")
      .eq("brand_id", data.brandId)
      .order("created_at", { ascending: false })
      .limit(data.limit || 50);

    if (error) {
      throw new Error(`FAILED_TO_FETCH_ADDON_EVENTS: ${error.message}`);
    }

    return (events || []) as BrandAddonEvent[];
  });

/**
 * 11. Super Admin: List Platform Add-on Policies
 */
export const listPlatformAddonPolicies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase as any;
    const { data: policies, error } = await db.from("platform_addon_policies").select("*");

    if (error) {
      throw new Error(`FAILED_TO_FETCH_POLICIES: ${error.message}`);
    }

    return (policies || []) as PlatformAddonPolicy[];
  });

/**
 * 12. Super Admin: Upsert Platform Add-on Policy
 */
export const updatePlatformAddonPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      addonId: z.string(),
      availability: z.enum(["public", "beta", "internal", "deprecated"]),
      entitlementKey: z.string().nullable().optional(),
      defaultForActivities: z.array(z.string()).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { data: isSuperAdmin } = await db.rpc("is_super_admin");
    if (!isSuperAdmin) {
      throw new Error("UNAUTHORIZED_SUPER_ADMIN_ONLY");
    }

    const { error } = await db.from("platform_addon_policies").upsert(
      {
        addon_id: data.addonId,
        availability: data.availability,
        entitlement_key: data.entitlementKey ?? null,
        default_for_activities: data.defaultForActivities || [],
        updated_at: new Date().toISOString(),
      },
      { onConflict: "addon_id" },
    );

    if (error) {
      throw new Error(`FAILED_TO_UPDATE_POLICY: ${error.message}`);
    }

    return { success: true };
  });
