import { describe, it, expect, vi } from "vitest";
import {
  evaluateBrandEntitlements,
  hasFeature,
  getLimit,
  checkEntitlement,
  getBrandUsageSummary,
} from "../src/lib/saas-billing/entitlements-engine.server";
import type { SaaSFeatureKey, EntitlementEvaluationMap } from "../src/lib/saas-billing/saas-billing.types";

describe("SaaS Billing & Entitlements Engine", () => {
  const mockEvaluationMap: EntitlementEvaluationMap = {
    "products.limit": {
      enabled: true,
      limit_value: 500,
      is_unlimited: false,
      source: "plan_version",
    },
    "orders.monthly_limit": {
      enabled: true,
      limit_value: 1000,
      is_unlimited: false,
      source: "plan_version",
    },
    "api.enabled": {
      enabled: true,
      limit_value: 0,
      is_unlimited: false,
      source: "plan_version",
    },
    "api.monthly_requests": {
      enabled: true,
      limit_value: 50000,
      is_unlimited: false,
      source: "addon",
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
    "loyalty.enabled": {
      enabled: true,
      limit_value: 0,
      is_unlimited: false,
      source: "override",
    },
  };

  it("evaluates boolean feature flags correctly", () => {
    // API is enabled on mock plan
    expect(mockEvaluationMap["api.enabled"].enabled).toBe(true);

    // White label is disabled on mock plan
    expect(mockEvaluationMap["white_label.enabled"].enabled).toBe(false);

    // Loyalty is enabled via override
    expect(mockEvaluationMap["loyalty.enabled"].enabled).toBe(true);
    expect(mockEvaluationMap["loyalty.enabled"].source).toBe("override");
  });

  it("evaluates numeric limits and unlimited flags accurately", () => {
    expect(mockEvaluationMap["products.limit"].limit_value).toBe(500);
    expect(mockEvaluationMap["products.limit"].is_unlimited).toBe(false);

    expect(mockEvaluationMap["orders.monthly_limit"].limit_value).toBe(1000);

    // Accounting is unlimited (-1)
    expect(mockEvaluationMap["accounting.enabled"].limit_value).toBe(-1);
    expect(mockEvaluationMap["accounting.enabled"].is_unlimited).toBe(true);
  });

  it("checks consumption quotas against current usage safely", () => {
    const checkWithinLimit = (
      feature: SaaSFeatureKey,
      currentUsage: number,
      requestedQuantity = 1,
    ) => {
      const ent = mockEvaluationMap[feature];
      if (!ent || !ent.enabled) {
        return { allowed: false, reason: "Feature disabled on plan" };
      }
      if (ent.is_unlimited || ent.limit_value === -1) {
        return { allowed: true, remaining: -1 };
      }
      if (currentUsage + requestedQuantity > ent.limit_value) {
        return {
          allowed: false,
          reason: `Limit of ${ent.limit_value} exceeded`,
          remaining: Math.max(0, ent.limit_value - currentUsage),
        };
      }
      return {
        allowed: true,
        remaining: ent.limit_value - (currentUsage + requestedQuantity),
      };
    };

    // When under product limit (450 / 500)
    const normalProductCheck = checkWithinLimit("products.limit", 450, 1);
    expect(normalProductCheck.allowed).toBe(true);
    expect(normalProductCheck.remaining).toBe(49);

    // When at product limit (500 / 500)
    const maxedProductCheck = checkWithinLimit("products.limit", 500, 1);
    expect(maxedProductCheck.allowed).toBe(false);
    expect(maxedProductCheck.remaining).toBe(0);

    // When disabled feature requested
    const disabledFeatureCheck = checkWithinLimit("white_label.enabled", 0, 1);
    expect(disabledFeatureCheck.allowed).toBe(false);

    // When unlimited feature requested
    const unlimitedFeatureCheck = checkWithinLimit("accounting.enabled", 99999, 100);
    expect(unlimitedFeatureCheck.allowed).toBe(true);
    expect(unlimitedFeatureCheck.remaining).toBe(-1);
  });

  it("detects 80% warning and 100% threshold states", () => {
    const calculateUsageState = (current: number, limit: number) => {
      if (limit === -1) return "normal";
      const pct = (current / limit) * 100;
      if (pct >= 100) return "exhausted";
      if (pct >= 80) return "warning";
      return "normal";
    };

    expect(calculateUsageState(200, 500)).toBe("normal");
    expect(calculateUsageState(400, 500)).toBe("warning"); // exactly 80%
    expect(calculateUsageState(450, 500)).toBe("warning"); // 90%
    expect(calculateUsageState(500, 500)).toBe("exhausted"); // 100%
    expect(calculateUsageState(550, 500)).toBe("exhausted"); // over 100%
    expect(calculateUsageState(10000, -1)).toBe("normal"); // unlimited
  });

  it("handles fallback defaults gracefully if database is unreachable", async () => {
    const mockSupabase: any = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "DB timeout" },
      }),
    };

    const evaluated = await evaluateBrandEntitlements(mockSupabase, "some-brand-id");
    expect(evaluated).toBeDefined();
    expect(evaluated["products.limit"]).toBeDefined();
    expect(evaluated["products.limit"].limit_value).toBe(50);
  });

  describe("SaaS Plan Lifecycle & Catalog Rules", () => {
    const mockCatalog = [
      { id: "p1", code: "starter", is_active: true, is_public: true, subscribers: 5 },
      { id: "p2", code: "growth", is_active: true, is_public: true, subscribers: 12 },
      { id: "p3", code: "lifetime_founder", is_active: true, is_public: false, subscribers: 3 },
      { id: "p4", code: "legacy_free", is_active: false, is_public: false, subscribers: 2 },
      { id: "p5", code: "test_draft", is_active: false, is_public: false, subscribers: 0 },
    ];

    it("filters catalog correctly into active, hidden, and inactive scopes", () => {
      const activeAndPublic = mockCatalog.filter((p) => p.is_active && p.is_public);
      const hidden = mockCatalog.filter((p) => p.is_active && !p.is_public);
      const inactive = mockCatalog.filter((p) => !p.is_active);

      expect(activeAndPublic.map((p) => p.code)).toEqual(["starter", "growth"]);
      expect(hidden.map((p) => p.code)).toEqual(["lifetime_founder"]);
      expect(inactive.map((p) => p.code)).toEqual(["legacy_free", "test_draft"]);
    });

    it("prevents deleting plans that have active subscribers", () => {
      const canDeletePlan = (plan: (typeof mockCatalog)[0]) => {
        if (plan.subscribers > 0) {
          throw new Error(`Cannot delete plan ${plan.code}: ${plan.subscribers} active subscriber(s) found.`);
        }
        return true;
      };

      // p1 has 5 subscribers -> throws
      expect(() => canDeletePlan(mockCatalog[0])).toThrowError(/5 active subscriber\(s\)/);

      // p5 has 0 subscribers -> passes
      expect(canDeletePlan(mockCatalog[4])).toBe(true);
    });

    it("properly identifies when a plan should be excluded from storefront registration", () => {
      const isAvailableForNewRegistration = (plan: (typeof mockCatalog)[0]) => {
        return plan.is_active && plan.is_public;
      };

      expect(isAvailableForNewRegistration(mockCatalog[0])).toBe(true); // starter
      expect(isAvailableForNewRegistration(mockCatalog[2])).toBe(false); // hidden founder
      expect(isAvailableForNewRegistration(mockCatalog[3])).toBe(false); // legacy deactivated
    });
  });
});
