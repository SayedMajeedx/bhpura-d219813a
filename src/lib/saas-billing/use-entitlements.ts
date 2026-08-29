// ==============================================================================
// BOUTQ OS: USE ENTITLEMENTS & USAGE METER REACT HOOKS
// ==============================================================================

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  EntitlementEvaluationMap,
  SaaSFeatureKey,
  EffectiveEntitlement,
  SaaSUsageSnapshot,
} from "./saas-billing.types";

interface UseEntitlementsOptions {
  brandId: string | undefined | null;
}

/**
 * Hook to fetch all effective entitlements for a brand.
 */
export function useEntitlements(optionsOrBrandId: UseEntitlementsOptions | string | undefined | null) {
  const brandId =
    typeof optionsOrBrandId === "string" || optionsOrBrandId === null || optionsOrBrandId === undefined
      ? optionsOrBrandId
      : optionsOrBrandId.brandId;

  const query = useQuery({
    queryKey: ["brand_entitlements", brandId],
    queryFn: async (): Promise<EntitlementEvaluationMap> => {
      if (!brandId) return {} as EntitlementEvaluationMap;

      const { data, error } = await (supabase as any).rpc("rpc_evaluate_brand_entitlements", {
        _brand_id: brandId,
      });

      if (error || !data) {
        console.warn("[useEntitlements] RPC failed:", error);
        return {} as EntitlementEvaluationMap;
      }

      return data as unknown as EntitlementEvaluationMap;
    },
    enabled: Boolean(brandId),
    staleTime: 1000 * 60 * 5, // 5 minutes cache
  });

  const usageQuery = useQuery({
    queryKey: ["brand_usage_snapshots_map", brandId],
    queryFn: async (): Promise<Record<string, SaaSUsageSnapshot>> => {
      if (!brandId) return {};
      const { data, error } = await (supabase as any)
        .from("saas_usage_snapshots")
        .select("*")
        .eq("brand_id", brandId);

      if (error || !data) return {};

      const map: Record<string, SaaSUsageSnapshot> = {};
      for (const row of data) {
        map[row.metric_key] = row as SaaSUsageSnapshot;
      }
      return map;
    },
    enabled: Boolean(brandId),
    staleTime: 1000 * 60 * 2,
  });

  // Extract convenience helpers
  const limits: Record<string, number> = {};
  const features: Record<string, boolean> = {};

  if (query.data) {
    for (const [k, v] of Object.entries(query.data)) {
      limits[k] = v.is_unlimited ? -1 : v.limit_value;
      features[k] = v.enabled;
    }
  }

  return {
    entitlements: query.data
      ? {
          features,
          limits,
          raw: query.data,
        }
      : null,
    usageSnapshots: usageQuery.data || {},
    isLoading: query.isLoading || usageQuery.isLoading,
    error: query.error || usageQuery.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to check if a specific feature is enabled.
 */
export function useFeature(
  brandId: string | undefined | null,
  featureKey: SaaSFeatureKey,
): { isEnabled: boolean; isLoading: boolean; entitlement?: EffectiveEntitlement } {
  const { entitlements, isLoading } = useEntitlements(brandId);
  const entitlement = entitlements?.raw?.[featureKey];

  return {
    isEnabled: Boolean(entitlement?.enabled),
    isLoading,
    entitlement,
  };
}

/**
 * Hook to check a specific numeric limit (-1 = unlimited).
 */
export function useLimit(
  brandId: string | undefined | null,
  limitKey: SaaSFeatureKey,
): { limit: number; isUnlimited: boolean; isLoading: boolean } {
  const { entitlements, isLoading } = useEntitlements(brandId);
  const entitlement = entitlements?.raw?.[limitKey];

  return {
    limit: entitlement?.is_unlimited ? -1 : (entitlement?.limit_value ?? 0),
    isUnlimited: Boolean(entitlement?.is_unlimited),
    isLoading,
  };
}

/**
 * Hook to fetch usage snapshots for a brand.
 */
export function useUsageSnapshots(brandId: string | undefined | null) {
  return useQuery({
    queryKey: ["brand_usage_snapshots", brandId],
    queryFn: async () => {
      if (!brandId) return [];
      const { data, error } = await (supabase as any)
        .from("saas_usage_snapshots")
        .select("*")
        .eq("brand_id", brandId)
        .order("period_start", { ascending: false });

      if (error) throw error;
      return (data || []) as SaaSUsageSnapshot[];
    },
    enabled: Boolean(brandId),
    staleTime: 1000 * 60 * 2, // 2 minutes cache
  });
}
