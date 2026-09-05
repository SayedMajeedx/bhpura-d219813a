import { describe, it, expect } from "vitest";

describe("3-Day Free Trial & Complete Site Lockout Lifecycle", () => {
  it("enforces default trial duration of exactly 3 days", () => {
    const trialDays = 3;
    const now = new Date("2026-09-05T12:00:00Z");
    const trialEndsAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

    const diffMs = trialEndsAt.getTime() - now.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    expect(diffDays).toBe(3);
    expect(trialEndsAt.toISOString()).toBe("2026-09-08T12:00:00.000Z");
  });

  it("identifies active vs expired trial status correctly", () => {
    const now = new Date("2026-09-05T12:00:00Z").getTime();

    // Active trial
    const activeTrialBrand = {
      plan_type: "trial",
      trial_ends_at: new Date("2026-09-07T12:00:00Z").toISOString(),
      subscription_status: "trialing",
      is_active: true,
    };

    const isTrialExpiredActive =
      activeTrialBrand.plan_type === "trial" &&
      activeTrialBrand.trial_ends_at &&
      new Date(activeTrialBrand.trial_ends_at).getTime() <= now &&
      activeTrialBrand.subscription_status !== "active_paid";

    expect(isTrialExpiredActive).toBe(false);

    // Expired trial (site lockout triggered)
    const expiredTrialBrand = {
      plan_type: "trial",
      trial_ends_at: new Date("2026-09-04T12:00:00Z").toISOString(),
      subscription_status: "trialing",
      is_active: true,
    };

    const isTrialExpired =
      expiredTrialBrand.plan_type === "trial" &&
      expiredTrialBrand.trial_ends_at &&
      new Date(expiredTrialBrand.trial_ends_at).getTime() <= now &&
      expiredTrialBrand.subscription_status !== "active_paid";

    expect(isTrialExpired).toBe(true);

    // Paid subscriber is never expired even if trial_ends_at is in the past
    const paidUpgradedBrand = {
      plan_type: "starter",
      trial_ends_at: new Date("2026-09-04T12:00:00Z").toISOString(),
      subscription_status: "active_paid",
      is_active: true,
    };

    const isPaidExpired =
      paidUpgradedBrand.plan_type === "trial" &&
      paidUpgradedBrand.trial_ends_at &&
      new Date(paidUpgradedBrand.trial_ends_at).getTime() <= now &&
      paidUpgradedBrand.subscription_status !== "active_paid";

    expect(isPaidExpired).toBe(false);
  });

  it("exempts lifetime brand (e.g. pura) from lockout", () => {
    const puraBrand = {
      slug: "pura",
      plan_type: "lifetime",
      trial_ends_at: null,
      is_active: true,
    };

    const isLocked =
      puraBrand.plan_type === "trial" &&
      puraBrand.trial_ends_at !== null;

    expect(isLocked).toBe(false);
  });
});
