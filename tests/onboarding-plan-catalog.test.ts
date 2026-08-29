import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const onboarding = readFileSync("src/lib/onboarding.functions.ts", "utf8");
const page = readFileSync("src/routes/onboard.tsx", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260829210000_connect_onboarding_to_saas_catalog.sql",
  "utf8",
);

describe("onboarding SaaS catalog contract", () => {
  it("only exposes active public plans with current versions", () => {
    expect(onboarding).toContain('.eq("is_active", true)');
    expect(onboarding).toContain('.eq("is_public", true)');
    expect(onboarding).toContain('.eq("is_current", true)');
  });

  it("locks the selected plan version and server-calculated quote on the request", () => {
    expect(onboarding).toContain("selected_plan_version_id: selectedVersion?.id");
    expect(onboarding).toContain("quoted_price: quotedPrice");
    expect(onboarding).toContain('throw new Error("PLAN_SELECTION_REQUIRED")');
    expect(onboarding).toContain('throw new Error("PLAN_INTERVAL_NOT_FOR_SALE")');
  });

  it("activates the exact selected version as the brand subscription", () => {
    expect(onboarding).toContain('from("brand_subscriptions" as never)');
    expect(onboarding).toContain("plan_version_id: resolvedPlanVersionId");
    expect(onboarding).toContain("billing_interval: resolvedInterval");
  });

  it("renders the live catalog and monthly or annual prices on onboarding", () => {
    expect(page).toContain("getPublicOnboardingPlans");
    expect(page).toContain('chooseBillingInterval(interval)');
    expect(page).toContain("selectedPlanVersionId: selectedPlan.version.id");
    expect(migration).toContain('billing_interval IN (\'monthly\',\'annual\',\'trial\')');
  });

  it("sources the free-trial duration from the super-admin plan configuration", () => {
    expect(onboarding).toContain("getOnboardingTrialDays");
    expect(onboarding).toContain('.eq("code", "trial")');
    expect(page).toContain("getOnboardingTrialDays");
    expect(page).toContain("setTrialDays(configuredTrialDays)");
    expect(onboarding).toContain("resolvedTrialDays * 24 * 60 * 60 * 1000");
    expect(page).not.toContain("3-Day Free Trial");
    expect(page).not.toContain("3 أيام");
  });
});
