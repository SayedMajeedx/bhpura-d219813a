// ==============================================================================
// BOUTQ OS: CENTRALIZED ENTITLEMENTS & USAGE METERING SERVER ENGINE
// ==============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  EffectiveEntitlement,
  EntitlementCheckResult,
  EntitlementEvaluationMap,
  ConsumeUsageResult,
  SaaSFeatureKey,
} from "./saas-billing.types";

/**
 * Fallback defaults used only if database fails to resolve entitlements.
 */
const DEFAULT_FALLBACK_ENTITLEMENTS: Partial<Record<SaaSFeatureKey, EffectiveEntitlement>> = {
  "products.limit": { enabled: true, limit_value: 50, is_unlimited: false, source: "plan_version" },
  "orders.monthly_limit": { enabled: true, limit_value: 100, is_unlimited: false, source: "plan_version" },
  "team.members_limit": { enabled: true, limit_value: 2, is_unlimited: false, source: "plan_version" },
  "storage.bytes_limit": { enabled: true, limit_value: 2, is_unlimited: false, source: "plan_version" },
  "returns.enabled": { enabled: true, limit_value: 15, is_unlimited: false, source: "plan_version" },
  "loyalty.enabled": { enabled: false, limit_value: 0, is_unlimited: false, source: "plan_version" },
  "abandoned_carts.enabled": { enabled: false, limit_value: 0, is_unlimited: false, source: "plan_version" },
  "api.enabled": { enabled: false, limit_value: 0, is_unlimited: false, source: "plan_version" },
  "webhooks.enabled": { enabled: false, limit_value: 0, is_unlimited: false, source: "plan_version" },
  "custom_domain.enabled": { enabled: false, limit_value: 0, is_unlimited: false, source: "plan_version" },
  "white_label.enabled": { enabled: false, limit_value: 0, is_unlimited: false, source: "plan_version" },
  "mobile_factory.enabled": { enabled: false, limit_value: 0, is_unlimited: false, source: "plan_version" },
  "accounting.enabled": { enabled: true, limit_value: -1, is_unlimited: true, source: "plan_version" },
  "incubators.enabled": { enabled: false, limit_value: 0, is_unlimited: false, source: "plan_version" },
  "import_center.enabled": { enabled: false, limit_value: 0, is_unlimited: false, source: "plan_version" },
};

/**
 * Evaluates all effective entitlements for a brand by combining its plan version,
 * active add-on grants, and custom brand overrides.
 */
export async function evaluateBrandEntitlements(
  supabase: SupabaseClient,
  brandId: string,
): Promise<EntitlementEvaluationMap> {
  if (!brandId) return DEFAULT_FALLBACK_ENTITLEMENTS as EntitlementEvaluationMap;

  try {
    const { data, error } = await supabase.rpc("rpc_evaluate_brand_entitlements", {
      _brand_id: brandId,
    });

    if (error || !data || data.error) {
      console.warn(`[EntitlementsEngine] RPC evaluation returned fallback for brand ${brandId}:`, error || data?.error);
      return DEFAULT_FALLBACK_ENTITLEMENTS as EntitlementEvaluationMap;
    }

    return data as EntitlementEvaluationMap;
  } catch (err) {
    console.error(`[EntitlementsEngine] Error calling rpc_evaluate_brand_entitlements for brand ${brandId}:`, err);
    return DEFAULT_FALLBACK_ENTITLEMENTS as EntitlementEvaluationMap;
  }
}

/**
 * Evaluates a single feature boolean flag for a brand.
 */
export async function hasFeature(
  supabase: SupabaseClient,
  brandId: string,
  featureKey: SaaSFeatureKey,
): Promise<boolean> {
  const map = await evaluateBrandEntitlements(supabase, brandId);
  const ent = map[featureKey];
  return Boolean(ent?.enabled);
}

/**
 * Evaluates a numeric limit for a brand (-1 means unlimited).
 */
export async function getLimit(
  supabase: SupabaseClient,
  brandId: string,
  limitKey: SaaSFeatureKey,
): Promise<number> {
  const map = await evaluateBrandEntitlements(supabase, brandId);
  const ent = map[limitKey];
  if (!ent) return 0;
  return ent.is_unlimited ? -1 : (ent.limit_value ?? 0);
}

/**
 * Checks whether an action requiring an entitlement / quota is permitted.
 */
export async function checkEntitlement(
  supabase: SupabaseClient,
  brandId: string,
  featureKey: SaaSFeatureKey,
  requestedAmount: number = 1,
): Promise<EntitlementCheckResult> {
  try {
    const { data, error } = await supabase.rpc("rpc_check_entitlement", {
      _brand_id: brandId,
      _feature_key: featureKey,
      _requested_amount: requestedAmount,
    });

    if (error || !data) {
      // Fallback evaluation
      const map = await evaluateBrandEntitlements(supabase, brandId);
      const ent = map[featureKey];
      if (!ent || !ent.enabled) {
        return {
          allowed: false,
          reason: "feature_disabled",
          feature_key: featureKey,
          limit_value: ent?.limit_value ?? 0,
          is_unlimited: Boolean(ent?.is_unlimited),
          source: ent?.source,
        };
      }
      return {
        allowed: true,
        feature_key: featureKey,
        limit_value: ent.limit_value,
        is_unlimited: ent.is_unlimited,
        source: ent.source,
      };
    }

    return data as EntitlementCheckResult;
  } catch (err) {
    console.error(`[EntitlementsEngine] checkEntitlement exception for ${featureKey}:`, err);
    return {
      allowed: true,
      feature_key: featureKey,
      limit_value: -1,
      is_unlimited: true,
      source: "fallback",
    };
  }
}

/**
 * Consumes usage for a given metric key atomically.
 * Automatically handles billing period snapshots, idempotency, and 80%/100% threshold detection.
 */
export async function consumeBrandUsage(
  supabase: SupabaseClient,
  brandId: string,
  metricKey: string,
  quantity: number = 1,
  idempotencyKey?: string,
  metadata?: Record<string, any>,
): Promise<ConsumeUsageResult> {
  try {
    const { data, error } = await supabase.rpc("rpc_consume_usage", {
      _brand_id: brandId,
      _metric_key: metricKey,
      _quantity: quantity,
      _idempotency_key: idempotencyKey ?? null,
      _metadata: metadata ?? {},
    });

    if (error || !data) {
      console.error(`[EntitlementsEngine] rpc_consume_usage error for brand ${brandId}, metric ${metricKey}:`, error);
      return {
        success: false,
        current_usage: 0,
        metric_key: metricKey,
        warning_triggered: null,
      };
    }

    return data as ConsumeUsageResult;
  } catch (err) {
    console.error(`[EntitlementsEngine] consumeBrandUsage exception:`, err);
    return {
      success: false,
      current_usage: 0,
      metric_key: metricKey,
      warning_triggered: null,
    };
  }
}

/**
 * Fetches current usage snapshots for all metrics in the current billing cycle.
 */
export async function getBrandUsageSummary(
  supabase: SupabaseClient,
  brandId: string,
): Promise<Record<string, { current_usage: number; limit_value: number; is_unlimited: boolean; percent: number; warning_triggered: string | null }>> {
  const entitlements = await evaluateBrandEntitlements(supabase, brandId);

  // Fetch active billing period usage snapshots
  const { data: snapshots } = await supabase
    .from("saas_usage_snapshots")
    .select("*")
    .eq("brand_id", brandId)
    .order("period_start", { ascending: false });

  // Map of known metrics to their entitlement keys
  const metricMapping: Record<string, { entKey: SaaSFeatureKey; labelEn: string; labelAr: string }> = {
    products: { entKey: "products.limit", labelEn: "Products", labelAr: "المنتجات" },
    orders: { entKey: "orders.monthly_limit", labelEn: "Monthly Orders", labelAr: "الطلبات الشهرية" },
    team_members: { entKey: "team.members_limit", labelEn: "Team Members", labelAr: "أعضاء الفريق" },
    storage_bytes: { entKey: "storage.bytes_limit", labelEn: "Storage (GB)", labelAr: "المساحة السحابية" },
    api_requests: { entKey: "api.monthly_requests", labelEn: "API Requests", labelAr: "استدعاءات API" },
    abandoned_cart_messages: { entKey: "abandoned_carts.monthly_messages", labelEn: "Abandoned Cart Messages", labelAr: "رسائل السلات المتروكة" },
    returns: { entKey: "returns.monthly_limit", labelEn: "Returns", labelAr: "طلبات الإرجاع" },
  };

  const result: Record<string, { current_usage: number; limit_value: number; is_unlimited: boolean; percent: number; warning_triggered: string | null }> = {};

  // For products, compute live count if snapshot not yet recorded
  for (const [metricKey, info] of Object.entries(metricMapping)) {
    const ent = entitlements[info.entKey];
    const isUnlimited = Boolean(ent?.is_unlimited);
    const limit = ent?.limit_value ?? 0;

    let currentUsage = 0;
    const snap = (snapshots || []).find((s) => s.metric_key === metricKey);
    if (snap) {
      currentUsage = Number(snap.current_usage);
    } else if (metricKey === "products") {
      // Live count fallback
      const { count } = await supabase.from("products").select("id", { count: "exact", head: true }).eq("brand_id", brandId);
      currentUsage = count || 0;
    } else if (metricKey === "team_members") {
      const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("brand_id", brandId);
      currentUsage = count || 0;
    }

    let percent = 0;
    if (isUnlimited) {
      percent = 0;
    } else if (limit > 0) {
      percent = Math.min(100, Math.round((currentUsage / limit) * 100));
    } else if (currentUsage > 0) {
      percent = 100;
    }

    let warning: string | null = null;
    if (!isUnlimited && limit > 0) {
      if (currentUsage >= limit) warning = "limit_100_reached";
      else if (currentUsage >= limit * 0.8) warning = "warning_80_reached";
    }

    result[metricKey] = {
      current_usage: currentUsage,
      limit_value: limit,
      is_unlimited: isUnlimited,
      percent,
      warning_triggered: warning,
    };
  }

  return result;
}
