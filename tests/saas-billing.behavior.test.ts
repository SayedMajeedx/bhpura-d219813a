import { describe, expect, it, vi } from "vitest";
import {
  evaluateBrandEntitlements,
  hasFeature,
  getLimit,
  checkEntitlement,
} from "../src/lib/saas-billing/entitlements-engine.server";
import type { SaaSFeatureKey } from "../src/lib/saas-billing/saas-billing.types";

function createMockSupabase(rpcResponses: Record<string, { data?: any; error?: any }>) {
  return {
    rpc: vi.fn(async (fnName: string, _args: any) => {
      const resp = rpcResponses[fnName];
      if (!resp) return { data: null, error: new Error(`Unknown RPC ${fnName}`) };
      return resp;
    }),
  } as any;
}

describe("SaaS Billing & Entitlements Engine Behavioral Suite", () => {
  const sampleEntitlements = {
    "products.limit": {
      enabled: true,
      limit_value: 250,
      is_unlimited: false,
      source: "plan_version",
    },
    "orders.monthly_limit": {
      enabled: true,
      limit_value: 500,
      is_unlimited: false,
      source: "plan_version",
    },
    "api.enabled": {
      enabled: true,
      limit_value: 0,
      is_unlimited: false,
      source: "plan_version",
    },
    "white_label.enabled": {
      enabled: false,
      limit_value: 0,
      is_unlimited: false,
      source: "plan_version",
    },
    "accounting.enabled": {
      enabled: true,
      limit_value: -1,
      is_unlimited: true,
      source: "plan_version",
    },
  };

  describe("evaluateBrandEntitlements", () => {
    it("returns RPC evaluated entitlements on success", async () => {
      const mockSupabase = createMockSupabase({
        rpc_evaluate_brand_entitlements: { data: sampleEntitlements, error: null },
      });

      const res = await evaluateBrandEntitlements(mockSupabase, "brand-123");
      expect(mockSupabase.rpc).toHaveBeenCalledWith("rpc_evaluate_brand_entitlements", {
        _brand_id: "brand-123",
      });
      expect(res).toEqual(sampleEntitlements);
    });

    it("falls back to default fallback entitlements when brandId is missing or null", async () => {
      const mockSupabase = createMockSupabase({});
      const res = await evaluateBrandEntitlements(mockSupabase, "");
      expect(res["products.limit"]).toEqual({
        enabled: true,
        limit_value: 50,
        is_unlimited: false,
        source: "plan_version",
      });
      expect(mockSupabase.rpc).not.toHaveBeenCalled();
    });

    it("falls back to default fallback entitlements on RPC failure or database error", async () => {
      const mockSupabase = createMockSupabase({
        rpc_evaluate_brand_entitlements: { data: null, error: new Error("DB connection timeout") },
      });

      const res = await evaluateBrandEntitlements(mockSupabase, "brand-error");
      expect(res["products.limit"].limit_value).toBe(50);
      expect(res["accounting.enabled"].is_unlimited).toBe(true);
    });
  });

  describe("hasFeature", () => {
    it("returns true for enabled feature flags and false for disabled flags", async () => {
      const mockSupabase = createMockSupabase({
        rpc_evaluate_brand_entitlements: { data: sampleEntitlements, error: null },
      });

      const hasApi = await hasFeature(mockSupabase, "brand-123", "api.enabled");
      const hasWhiteLabel = await hasFeature(mockSupabase, "brand-123", "white_label.enabled");
      const hasUnknown = await hasFeature(
        mockSupabase,
        "brand-123",
        "custom_domain.enabled" as SaaSFeatureKey,
      );

      expect(hasApi).toBe(true);
      expect(hasWhiteLabel).toBe(false);
      expect(hasUnknown).toBe(false);
    });
  });

  describe("getLimit", () => {
    it("returns exact numeric limit for capped features", async () => {
      const mockSupabase = createMockSupabase({
        rpc_evaluate_brand_entitlements: { data: sampleEntitlements, error: null },
      });

      const productLimit = await getLimit(mockSupabase, "brand-123", "products.limit");
      const orderLimit = await getLimit(mockSupabase, "brand-123", "orders.monthly_limit");

      expect(productLimit).toBe(250);
      expect(orderLimit).toBe(500);
    });

    it("returns -1 for unlimited features", async () => {
      const mockSupabase = createMockSupabase({
        rpc_evaluate_brand_entitlements: { data: sampleEntitlements, error: null },
      });

      const accountingLimit = await getLimit(mockSupabase, "brand-123", "accounting.enabled");
      expect(accountingLimit).toBe(-1);
    });

    it("returns 0 for missing or unconfigured features", async () => {
      const mockSupabase = createMockSupabase({
        rpc_evaluate_brand_entitlements: { data: sampleEntitlements, error: null },
      });

      const nonExistent = await getLimit(
        mockSupabase,
        "brand-123",
        "non_existent.limit" as SaaSFeatureKey,
      );
      expect(nonExistent).toBe(0);
    });
  });

  describe("checkEntitlement", () => {
    it("returns allowed check result from RPC when valid", async () => {
      const mockSupabase = createMockSupabase({
        rpc_check_entitlement: {
          data: {
            allowed: true,
            feature_key: "products.limit",
            limit_value: 250,
            current_usage: 120,
            remaining: 130,
            is_unlimited: false,
          },
          error: null,
        },
      });

      const result = await checkEntitlement(mockSupabase, "brand-123", "products.limit", 1);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(130);
    });

    it("falls back to local evaluation when RPC call returns error", async () => {
      const mockSupabase = createMockSupabase({
        rpc_check_entitlement: { data: null, error: new Error("RPC missing") },
        rpc_evaluate_brand_entitlements: { data: sampleEntitlements, error: null },
      });

      const result = await checkEntitlement(mockSupabase, "brand-123", "api.enabled");
      expect(result.allowed).toBe(true);
      expect(result.feature_key).toBe("api.enabled");
    });

    it("rejects disabled features in fallback evaluation", async () => {
      const mockSupabase = createMockSupabase({
        rpc_check_entitlement: { data: null, error: new Error("RPC missing") },
        rpc_evaluate_brand_entitlements: { data: sampleEntitlements, error: null },
      });

      const result = await checkEntitlement(mockSupabase, "brand-123", "white_label.enabled");
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("feature_disabled");
    });
  });
});
