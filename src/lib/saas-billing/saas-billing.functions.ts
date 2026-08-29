// ==============================================================================
// BOUTQ OS: SAAS BILLING & ENTITLEMENTS SERVER FUNCTIONS
// ==============================================================================

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  evaluateBrandEntitlements,
  getBrandUsageSummary,
  consumeBrandUsage,
} from "./entitlements-engine.server";
import type {
  SaaSPlan,
  SaaSPlanVersion,
  SaaSFeature,
  SaaSAddon,
  BrandSubscription,
  BrandEntitlementOverride,
} from "./saas-billing.types";

// Helper to assert superadmin authorization
async function requireSuperAdmin(context: any) {
  const db = context.supabase as any;
  const { data: isSuperAdmin, error } = await db.rpc("is_super_admin");
  if (error || !isSuperAdmin) {
    throw new Error("UNAUTHORIZED_SUPER_ADMIN_REQUIRED");
  }
}

// Helper to assert brand access
async function requireBrandAccess(context: any, brandId: string) {
  const db = context.supabase as any;
  const { data: hasAccess } = await db.rpc("can_access_brand", {
    _brand_id: brandId,
  });
  if (!hasAccess) {
    const { data: isSuperAdmin } = await db.rpc("is_super_admin");
    if (!isSuperAdmin) {
      try {
        const { readImpersonationCookie, verifyImpersonationToken } = await import(
          "@/lib/impersonation-cookies.server"
        );
        const token = await readImpersonationCookie();
        const payload = await verifyImpersonationToken(token);
        if (payload && payload.targetTenantId === brandId) {
          return;
        }
      } catch {}
      throw new Error("UNAUTHORIZED_BRAND_ACCESS_DENIED");
    }
  }
}

// ==============================================================================
// SUPER ADMIN SERVER FUNCTIONS
// ==============================================================================

/**
 * 1. List all plans with their version histories, features and subscriber counts
 */
export const listPlansWithDetails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context);
    const db = context.supabase as any;

    // Fetch plans
    const { data: plans, error: plansErr } = await db
      .from("saas_plans")
      .select("*")
      .order("sort_order", { ascending: true });

    if (plansErr) throw plansErr;

    // Fetch all versions
    const { data: versions, error: verErr } = await db
      .from("saas_plan_versions")
      .select("*")
      .order("version_number", { ascending: false });

    if (verErr) throw verErr;

    // Fetch all plan features
    const { data: planFeatures, error: pfErr } = await db
      .from("saas_plan_features")
      .select("*");

    if (pfErr) throw pfErr;

    // Fetch features catalog
    const { data: features, error: featErr } = await db
      .from("saas_features")
      .select("*")
      .order("sort_order", { ascending: true });

    if (featErr) throw featErr;

    // Fetch subscription counts grouped by plan
    const { data: subscriptions, error: subErr } = await db
      .from("brand_subscriptions")
      .select("plan_id, plan_version_id, status");

    if (subErr) throw subErr;

    const subCounts: Record<string, number> = {};
    (subscriptions || []).forEach((s: any) => {
      subCounts[s.plan_id] = (subCounts[s.plan_id] || 0) + 1;
    });

    return {
      plans: (plans || []) as SaaSPlan[],
      versions: (versions || []) as SaaSPlanVersion[],
      planFeatures: planFeatures || [],
      features: (features || []) as SaaSFeature[],
      subscribersCountByPlan: subCounts,
    };
  });

/**
 * 2. Create a new Version for an existing plan (Immutable Versioning & Grandfathering)
 */
const CreatePlanVersionInput = z.object({
  planId: z.string().uuid(),
  priceMonthly: z.number().min(0),
  priceAnnual: z.number().min(0),
  changeSummary: z.string().min(3),
  features: z.array(
    z.object({
      featureKey: z.string(),
      booleanValue: z.boolean().nullable(),
      numericValue: z.number().nullable(),
    }),
  ),
});

export const createPlanVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => CreatePlanVersionInput.parse(raw))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context);
    const db = context.supabase as any;

    // Fetch latest version number for this plan
    const { data: latestVer } = await db
      .from("saas_plan_versions")
      .select("version_number")
      .eq("plan_id", data.planId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVerNumber = (latestVer?.version_number || 0) + 1;

    // Mark previous current versions as non-current
    await db
      .from("saas_plan_versions")
      .update({ is_current: false, effective_until: new Date().toISOString() })
      .eq("plan_id", data.planId)
      .eq("is_current", true);

    // Insert new version
    const { data: newVer, error: insertErr } = await db
      .from("saas_plan_versions")
      .insert({
        plan_id: data.planId,
        version_number: nextVerNumber,
        price_monthly: data.priceMonthly,
        price_annual: data.priceAnnual,
        currency: "BHD",
        is_current: true,
        effective_from: new Date().toISOString(),
        change_summary: data.changeSummary,
        created_by: context.userId || null,
      })
      .select()
      .single();

    if (insertErr || !newVer) {
      throw insertErr || new Error("FAILED_TO_CREATE_PLAN_VERSION");
    }

    // Insert plan feature entries
    const featureInserts = data.features.map((f) => ({
      plan_version_id: newVer.id,
      feature_key: f.featureKey,
      boolean_value: f.booleanValue,
      numeric_value: f.numericValue,
      is_unlimited: f.numericValue === -1,
    }));

    if (featureInserts.length > 0) {
      const { error: featInsertErr } = await db
        .from("saas_plan_features")
        .insert(featureInserts);

      if (featInsertErr) throw featInsertErr;
    }

    // Log in audit trail
    await db.from("saas_audit_logs").insert({
      actor_id: context.userId || null,
      actor_email: context.claims?.email || null,
      action: "plan_version.published",
      target_type: "plan_version",
      target_id: newVer.id,
      changes: {
        plan_id: data.planId,
        version_number: nextVerNumber,
        features_count: data.features.length,
      },
    });

    return { version: newVer as SaaSPlanVersion };
  });

/**
 * 3. List all Add-ons
 */
export const listAddons = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireSuperAdmin(context);
    const db = context.supabase as any;

    const { data: addons, error } = await db
      .from("saas_addons")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (addons || []) as SaaSAddon[];
  });

/**
 * 4. Create or Update SaaS Add-on
 */
const UpsertAddonInput = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(2),
  nameAr: z.string().min(2),
  nameEn: z.string().min(2),
  descriptionAr: z.string().optional(),
  descriptionEn: z.string().optional(),
  targetFeatureKey: z.string().min(2),
  grantNumericAmount: z.number().min(0),
  grantBooleanValue: z.boolean().nullable().optional(),
  priceMonthly: z.number().min(0),
  priceAnnual: z.number().min(0),
  isActive: z.boolean().default(true),
});

export const upsertAddon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => UpsertAddonInput.parse(raw))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context);
    const db = context.supabase as any;

    if (data.id) {
      // Update
      const { error } = await db
        .from("saas_addons")
        .update({
          code: data.code,
          name_ar: data.nameAr,
          name_en: data.nameEn,
          description_ar: data.descriptionAr || null,
          description_en: data.descriptionEn || null,
          target_feature_key: data.targetFeatureKey,
          grant_numeric_amount: data.grantNumericAmount,
          grant_boolean_value: data.grantBooleanValue ?? null,
          price_monthly: data.priceMonthly,
          price_annual: data.priceAnnual,
          is_active: data.isActive,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.id);

      if (error) throw error;
    } else {
      // Create
      const { error } = await db.from("saas_addons").insert({
        code: data.code,
        name_ar: data.nameAr,
        name_en: data.nameEn,
        description_ar: data.descriptionAr || null,
        description_en: data.descriptionEn || null,
        target_feature_key: data.targetFeatureKey,
        grant_numeric_amount: data.grantNumericAmount,
        grant_boolean_value: data.grantBooleanValue ?? null,
        price_monthly: data.priceMonthly,
        price_annual: data.priceAnnual,
        is_active: data.isActive,
      });

      if (error) throw error;
    }

    return { success: true };
  });

/**
 * 5. Set or Revoke Brand Custom Override
 */
const SetBrandOverrideInput = z.object({
  brandId: z.string().uuid(),
  featureKey: z.string().min(2),
  booleanValue: z.boolean().nullable().optional(),
  numericValue: z.number().nullable().optional(),
  reason: z.string().min(3),
  expiresAt: z.string().nullable().optional(),
});

export const setBrandEntitlementOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => SetBrandOverrideInput.parse(raw))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context);
    const db = context.supabase as any;

    const overrideType =
      data.numericValue !== undefined && data.numericValue !== null
        ? "set_limit"
        : "set_boolean";

    const { error } = await db.from("brand_entitlement_overrides").upsert(
      {
        brand_id: data.brandId,
        feature_key: data.featureKey,
        override_type: overrideType,
        boolean_value: data.booleanValue ?? null,
        numeric_value: data.numericValue ?? null,
        reason: data.reason,
        created_by: context.userId || null,
        expires_at: data.expiresAt || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "brand_id,feature_key" },
    );

    if (error) throw error;

    await db.from("saas_audit_logs").insert({
      actor_id: context.userId || null,
      actor_email: context.claims?.email || null,
      action: "override.set",
      target_type: "brand_override",
      target_id: data.brandId,
      brand_id: data.brandId,
      changes: data,
    });

    return { success: true };
  });

/**
 * 6. Remove Brand Custom Override
 */
const RemoveBrandOverrideInput = z.object({
  brandId: z.string().uuid(),
  featureKey: z.string().min(2),
});

export const removeBrandEntitlementOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => RemoveBrandOverrideInput.parse(raw))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context);
    const db = context.supabase as any;

    const { error } = await db
      .from("brand_entitlement_overrides")
      .delete()
      .eq("brand_id", data.brandId)
      .eq("feature_key", data.featureKey);

    if (error) throw error;

    await db.from("saas_audit_logs").insert({
      actor_id: context.userId || null,
      actor_email: context.claims?.email || null,
      action: "override.removed",
      target_type: "brand_override",
      target_id: data.brandId,
      brand_id: data.brandId,
      changes: { feature_key: data.featureKey },
    });

    return { success: true };
  });

/**
 * 7. List Overrides and Audit Logs
 */
export const listBrandOverridesAndAuditLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => z.object({ brandId: z.string().uuid().optional() }).parse(raw))
  .handler(async ({ data, context }) => {
    await requireSuperAdmin(context);
    const db = context.supabase as any;

    let overridesQuery = db
      .from("brand_entitlement_overrides")
      .select("*")
      .order("created_at", { ascending: false });

    if (data.brandId) {
      overridesQuery = overridesQuery.eq("brand_id", data.brandId);
    }

    const { data: overrides, error } = await overridesQuery;
    if (error) throw error;

    let logsQuery = db
      .from("saas_audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (data.brandId) {
      logsQuery = logsQuery.eq("brand_id", data.brandId);
    }

    const { data: logs, error: logsErr } = await logsQuery;
    if (logsErr) throw logsErr;

    return {
      overrides: (overrides || []) as BrandEntitlementOverride[],
      auditLogs: logs || [],
    };
  });

// ==============================================================================
// BRAND MERCHANT SERVER FUNCTIONS
// ==============================================================================

/**
 * 8. Get complete subscription and usage details for a brand
 */
export const getBrandSubscriptionDetails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => z.object({ brandId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    await requireBrandAccess(context, data.brandId);
    const db = context.supabase as any;

    // Fetch subscription record
    let { data: subscription } = await db
      .from("brand_subscriptions")
      .select("*, saas_plans(*), saas_plan_versions(*)")
      .eq("brand_id", data.brandId)
      .maybeSingle();

    // If subscription record doesn't exist yet, seed it from legacy brands
    if (!subscription) {
      await db.rpc("rpc_sync_legacy_brands_to_subscriptions");
      const { data: syncedSub } = await db
        .from("brand_subscriptions")
        .select("*, saas_plans(*), saas_plan_versions(*)")
        .eq("brand_id", data.brandId)
        .maybeSingle();
      subscription = syncedSub;
    }

    // Fetch active add-ons
    const { data: brandAddons } = await db
      .from("brand_subscription_addons")
      .select("*, saas_addons(*)")
      .eq("brand_id", data.brandId)
      .eq("status", "active");

    // Fetch brand custom overrides
    const { data: overrides } = await db
      .from("brand_entitlement_overrides")
      .select("*")
      .eq("brand_id", data.brandId);

    // Evaluate live entitlements
    const effectiveEntitlements = await evaluateBrandEntitlements(context.supabase, data.brandId);

    // Get live usage summary
    const usageSummary = await getBrandUsageSummary(context.supabase, data.brandId);

    // Fetch store metadata
    const { data: brand } = await db
      .from("brands")
      .select("id, name_ar, name_en, slug, plan_type, subscription_status, subscription_expires_at, trial_ends_at, renewal_intent")
      .eq("id", data.brandId)
      .single();

    // Fetch available catalog add-ons
    const { data: availableAddons } = await db
      .from("saas_addons")
      .select("*")
      .eq("is_active", true);

    // Fetch all public plans
    const { data: allPlans } = await db
      .from("saas_plans")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    return {
      subscription: subscription as BrandSubscription,
      currentPlan: (subscription?.saas_plans || {}) as SaaSPlan,
      currentVersion: (subscription?.saas_plan_versions || {}) as SaaSPlanVersion,
      activeAddons: brandAddons || [],
      availableAddons: (availableAddons || []) as SaaSAddon[],
      overrides: (overrides || []) as BrandEntitlementOverride[],
      effectiveEntitlements,
      usageSummary,
      brand,
      allPlans: (allPlans || []) as SaaSPlan[],
    };
  });

/**
 * 9. Subscribe to / Cancel SaaS Add-on
 */
const SubscribeAddonInput = z.object({
  brandId: z.string().uuid(),
  addonId: z.string().uuid(),
  billingInterval: z.enum(["monthly", "annual"]).default("monthly"),
});

export const subscribeAddon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => SubscribeAddonInput.parse(raw))
  .handler(async ({ data, context }) => {
    await requireBrandAccess(context, data.brandId);
    const db = context.supabase as any;

    const { data: sub } = await db
      .from("brand_subscriptions")
      .select("id")
      .eq("brand_id", data.brandId)
      .single();

    if (!sub) throw new Error("BRAND_SUBSCRIPTION_NOT_FOUND");

    const { error } = await db.from("brand_subscription_addons").upsert(
      {
        brand_id: data.brandId,
        subscription_id: sub.id,
        addon_id: data.addonId,
        status: "active",
        billing_interval: data.billingInterval,
        starts_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "brand_id,addon_id" },
    );

    if (error) throw error;

    await db.from("saas_audit_logs").insert({
      actor_id: context.userId || null,
      actor_email: context.claims?.email || null,
      action: "addon.subscribed",
      target_type: "addon",
      target_id: data.addonId,
      brand_id: data.brandId,
      changes: data,
    });

    return { success: true };
  });

export const cancelAddon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => z.object({ brandId: z.string().uuid(), addonId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    await requireBrandAccess(context, data.brandId);
    const db = context.supabase as any;

    const { error } = await db
      .from("brand_subscription_addons")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("brand_id", data.brandId)
      .eq("addon_id", data.addonId);

    if (error) throw error;

    await db.from("saas_audit_logs").insert({
      actor_id: context.userId || null,
      actor_email: context.claims?.email || null,
      action: "addon.cancelled",
      target_type: "addon",
      target_id: data.addonId,
      brand_id: data.brandId,
      changes: { addon_id: data.addonId },
    });

    return { success: true };
  });

/**
 * 10. Request Plan Upgrade / Downgrade Decision or Safe Cancellation
 */
const CancelSubscriptionInput = z.object({
  brandId: z.string().uuid(),
  reason: z.string().optional(),
});

export const cancelBrandSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => CancelSubscriptionInput.parse(raw))
  .handler(async ({ data, context }) => {
    await requireBrandAccess(context, data.brandId);
    const db = context.supabase as any;

    const { error: subErr } = await db
      .from("brand_subscriptions")
      .update({
        cancel_at_period_end: true,
        renewal_intent: "cancel",
        updated_at: new Date().toISOString(),
      })
      .eq("brand_id", data.brandId);

    if (subErr) throw subErr;

    await db
      .from("brands")
      .update({
        renewal_intent: "cancel",
        renewal_intent_recorded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.brandId);

    await db.from("saas_audit_logs").insert({
      actor_id: context.userId || null,
      actor_email: context.claims?.email || null,
      action: "subscription.cancel_at_period_end",
      target_type: "subscription",
      target_id: data.brandId,
      brand_id: data.brandId,
      changes: data,
    });

    return { success: true };
  });
