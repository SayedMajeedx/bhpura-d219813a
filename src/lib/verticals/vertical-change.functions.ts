import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { installAddon } from "@/lib/addons/addons.functions";
import type { PlatformAddonPolicy } from "@/lib/addons/addon-types";
import { normalizeVertical, STORE_VERTICALS } from "@/lib/store-profile";
import { planVerticalChange, type VerticalChangePlan } from "@/lib/verticals/vertical-change";
import type { LeftoverFacts } from "@/lib/verticals/vertical-leftovers";
import { normalizeModuleOverrides } from "@/lib/store-profile";

/**
 * Changing a store's vertical, for a super admin: preview what the change
 * does, then apply it. The server always plans from the store as it is now
 * (a browser's lists are only choices within that plan). The add-ons the new
 * vertical needs are installed first (retry-safe: installed ones are
 * skipped); then apply_brand_vertical_change flips the vertical, switches the
 * chosen add-ons off, updates the categories and records the change, all in
 * one transaction. If an install fails, the vertical has not changed.
 */

type Db = SupabaseClient<Database>;

const VerticalInput = z.enum(STORE_VERTICALS);

const PreviewInput = z.object({
  brandId: z.string().uuid(),
  vertical: VerticalInput,
  syncCategories: z.boolean().default(true),
});

const ChangeInput = z.object({
  brandId: z.string().uuid(),
  vertical: VerticalInput,
  reason: z.string().trim().min(5).max(500),
  disableAddons: z.array(z.string()).max(50).default([]),
  syncCategories: z.boolean().default(true),
});

async function requireSuperAdmin(db: Db) {
  const { data, error } = await db.rpc("is_super_admin");
  if (error || data !== true) throw new Error("STORE_VERTICAL_SUPER_ADMIN_ONLY");
}

const FINISHED_ORDERS =
  "(completed,delivered,picked_up,cancelled,returned,archived_historical,draft)";

/** Counts of what a change of vertical would leave behind, read as the store is now. */
async function readLeftoverFacts(db: Db, brandId: string): Promise<LeftoverFacts> {
  const count = async (query: PromiseLike<{ count: number | null; error: unknown }>) => {
    const { count: n, error } = await query;
    if (error)
      throw new Error(`VERTICAL_PLAN_READ_FAILED: ${String((error as Error).message ?? error)}`);
    return n ?? 0;
  };
  const head = { count: "exact", head: true } as const;
  const openOrders = (method: string) =>
    count(
      db
        .from("orders")
        .select("id", head)
        .eq("brand_id", brandId)
        .eq("fulfillment_method", method)
        .not("status", "in", FINISHED_ORDERS),
    );
  const today = new Date().toISOString().slice(0, 10);
  const [
    settings,
    allProducts,
    services,
    delivery,
    pickup,
    digital,
    appointment,
    openBookings,
    activeIncubators,
    openReturns,
  ] = await Promise.all([
    db
      .from("business_settings")
      .select(
        "store_modules, delivery_enabled, pickup_enabled, shipping_zones, advance_payment_enabled, advance_payment_scope",
      )
      .eq("brand_id", brandId)
      .maybeSingle(),
    count(db.from("products").select("id", head).eq("brand_id", brandId)),
    count(
      db.from("products").select("id", head).eq("brand_id", brandId).eq("item_kind", "service"),
    ),
    openOrders("delivery"),
    openOrders("pickup"),
    openOrders("digital"),
    openOrders("appointment"),
    count(
      db
        .from("bookings")
        .select("id", head)
        .eq("brand_id", brandId)
        .in("status", ["requested", "hold", "confirmed"])
        .gte("event_date", today),
    ),
    count(db.from("incubators").select("id", head).eq("brand_id", brandId).eq("is_active", true)),
    count(
      db
        .from("return_requests")
        .select("id", head)
        .eq("brand_id", brandId)
        .eq("status", "requested"),
    ),
  ]);
  if (settings.error) throw new Error(`VERTICAL_PLAN_READ_FAILED: ${settings.error.message}`);
  const row = settings.data;
  return {
    moduleOverrides: normalizeModuleOverrides(row?.store_modules),
    products: Math.max(0, allProducts - services),
    services,
    openOrders: { delivery, pickup, digital, appointment },
    openBookings,
    activeIncubators,
    openReturns,
    deliveryEnabled: row?.delivery_enabled === true,
    pickupEnabled: row?.pickup_enabled === true,
    shippingZones: Array.isArray(row?.shipping_zones) ? row.shipping_zones.length : 0,
    advancePayment: {
      enabled: row?.advance_payment_enabled === true,
      scope: String(row?.advance_payment_scope ?? "all"),
    },
  };
}

/** Everything the plan needs about the store, read as it is now. */
async function planFor(
  db: Db,
  brandId: string,
  vertical: (typeof STORE_VERTICALS)[number],
  syncCategories: boolean,
): Promise<VerticalChangePlan> {
  const [settings, addons, categories, products, policies, facts] = await Promise.all([
    db.from("business_settings").select("store_vertical").eq("brand_id", brandId).maybeSingle(),
    db.from("brand_addons").select("addon_id, status").eq("brand_id", brandId),
    db.from("categories").select("id, slug, name_ar, name_en").eq("brand_id", brandId),
    db.from("products").select("category").eq("brand_id", brandId).not("category", "is", null),
    db.from("platform_addon_policies").select("*"),
    readLeftoverFacts(db, brandId),
  ]);
  for (const result of [settings, addons, categories, products, policies]) {
    if (result.error) throw new Error(`VERTICAL_PLAN_READ_FAILED: ${result.error.message}`);
  }
  if (!settings.data) throw new Error("BRAND_SETTINGS_NOT_FOUND");
  const usedKeys = new Set(
    (products.data ?? [])
      .map((row) =>
        String(row.category ?? "")
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean),
  );
  return planVerticalChange({
    brandId,
    from: normalizeVertical(settings.data.store_vertical),
    to: vertical,
    installed: addons.data ?? [],
    categories: categories.data ?? [],
    usedKeys,
    syncCategories,
    policies: (policies.data ?? []) as unknown as PlatformAddonPolicy[],
    facts,
  });
}

/** What changing the store to `vertical` would do, without doing it. */
export const previewVerticalChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => PreviewInput.parse(raw))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context.supabase);
    return planFor(context.supabase, data.brandId, data.vertical, data.syncCategories);
  });

/** Changes the store's vertical: required add-ons first, then one audited transaction. */
export const changeBrandVertical = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => ChangeInput.parse(raw))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    await requireSuperAdmin(db);
    const plan = await planFor(db, data.brandId, data.vertical, data.syncCategories);
    if (plan.from === plan.to) throw new Error("VERTICAL_UNCHANGED");

    for (const addonId of plan.install) {
      await installAddon({
        data: { brandId: data.brandId, addonId, source: "super_admin", withDependencies: true },
      });
    }

    // Only add-ons the plan allows may be switched off.
    const disable = data.disableAddons.filter((id) =>
      (plan.disableCandidates as string[]).includes(id),
    );
    const { data: applied, error } = await db.rpc("apply_brand_vertical_change", {
      p_brand_id: data.brandId,
      p_to_vertical: data.vertical,
      p_reason: data.reason,
      p_installed_addons: plan.install,
      p_disable_addons: disable,
      p_remove_category_ids: plan.categories?.remove.map((category) => category.id) ?? [],
      p_add_categories: (plan.categories?.add ?? []).map(
        ({ name_en, name_ar, slug, sort_order }) => ({ name_en, name_ar, slug, sort_order }),
      ),
    });
    if (error) throw new Error(error.message);
    return applied;
  });
