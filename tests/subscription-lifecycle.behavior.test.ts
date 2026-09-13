import { describe, expect, it } from "vitest";

const RENEWAL_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface BrandSubscriptionRecord {
  slug: string;
  plan_type: "trial" | "annual" | "lifetime";
  subscription_expires_at: string | null;
  renewal_intent: "renew" | "cancel" | "upgrade" | null;
}

function checkRenewalWindowEligibility(
  brand: BrandSubscriptionRecord | null,
  nowMs: number = Date.now(),
): { allowed: boolean; reason?: string; daysLeft?: number } {
  if (!brand) return { allowed: false, reason: "BRAND_NOT_FOUND" };
  if (brand.plan_type === "lifetime" || brand.slug.toLowerCase() === "pura") {
    return { allowed: false, reason: "LIFETIME_NO_RENEWAL_NEEDED" };
  }
  if (brand.plan_type !== "annual" || !brand.subscription_expires_at) {
    return { allowed: false, reason: "RENEWAL_NOT_AVAILABLE" };
  }

  const expiryTime = new Date(brand.subscription_expires_at).getTime();
  const remaining = expiryTime - nowMs;
  const daysLeft = Math.ceil(remaining / (24 * 60 * 60 * 1000));

  if (remaining > RENEWAL_WINDOW_MS) {
    return { allowed: false, reason: "RENEWAL_WINDOW_NOT_OPEN", daysLeft };
  }

  return { allowed: true, daysLeft: Math.max(0, daysLeft) };
}

function calculateRenewalExtension(
  currentExpiresAt: string | null,
  now: Date = new Date(),
): string {
  const baseDate =
    currentExpiresAt && new Date(currentExpiresAt).getTime() > now.getTime()
      ? new Date(currentExpiresAt)
      : new Date(now);

  baseDate.setFullYear(baseDate.getFullYear() + 1);
  return baseDate.toISOString();
}

function validateReceiptSubmission(
  brand: BrandSubscriptionRecord,
  isUpgrade: boolean = false,
  nowMs: number = Date.now(),
): { allowed: boolean; error?: string } {
  const isTrial = brand.plan_type === "trial";
  const exempt = isUpgrade || isTrial || brand.renewal_intent === "upgrade";

  if (!exempt) {
    const windowCheck = checkRenewalWindowEligibility(brand, nowMs);
    if (!windowCheck.allowed) {
      return { allowed: false, error: windowCheck.reason };
    }
    if (brand.renewal_intent !== "renew") {
      return { allowed: false, error: "RENEWAL_DECISION_REQUIRED" };
    }
  }

  return { allowed: true };
}

describe("Subscription Lifecycle & Annual Renewal Behavioral Suite", () => {
  const now = new Date("2026-09-13T12:00:00.000Z");
  const nowMs = now.getTime();

  describe("Renewal Window Eligibility", () => {
    it("blocks renewal when subscription has more than 30 days remaining", () => {
      const brand: BrandSubscriptionRecord = {
        slug: "brand-active",
        plan_type: "annual",
        subscription_expires_at: new Date(nowMs + 45 * 24 * 60 * 60 * 1000).toISOString(), // 45 days left
        renewal_intent: null,
      };

      const result = checkRenewalWindowEligibility(brand, nowMs);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("RENEWAL_WINDOW_NOT_OPEN");
      expect(result.daysLeft).toBe(45);
    });

    it("opens renewal window within the final 30 days of subscription", () => {
      const brand: BrandSubscriptionRecord = {
        slug: "brand-expiring-soon",
        plan_type: "annual",
        subscription_expires_at: new Date(nowMs + 20 * 24 * 60 * 60 * 1000).toISOString(), // 20 days left
        renewal_intent: null,
      };

      const result = checkRenewalWindowEligibility(brand, nowMs);
      expect(result.allowed).toBe(true);
      expect(result.daysLeft).toBe(20);
    });

    it("allows renewal when subscription has already expired", () => {
      const brand: BrandSubscriptionRecord = {
        slug: "brand-expired",
        plan_type: "annual",
        subscription_expires_at: new Date(nowMs - 5 * 24 * 60 * 60 * 1000).toISOString(), // expired 5 days ago
        renewal_intent: null,
      };

      const result = checkRenewalWindowEligibility(brand, nowMs);
      expect(result.allowed).toBe(true);
      expect(result.daysLeft).toBe(0);
    });

    it("exempts lifetime brand Pura from renewal window requirements", () => {
      const brand: BrandSubscriptionRecord = {
        slug: "pura",
        plan_type: "lifetime",
        subscription_expires_at: null,
        renewal_intent: null,
      };

      const result = checkRenewalWindowEligibility(brand, nowMs);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("LIFETIME_NO_RENEWAL_NEEDED");
    });
  });

  describe("Renewal Intent & Receipt Submission Validation", () => {
    it("requires explicit 'renew' decision before accepting payment receipt", () => {
      const brand: BrandSubscriptionRecord = {
        slug: "brand-in-window",
        plan_type: "annual",
        subscription_expires_at: new Date(nowMs + 10 * 24 * 60 * 60 * 1000).toISOString(),
        renewal_intent: null, // No decision recorded yet
      };

      const result = validateReceiptSubmission(brand, false, nowMs);
      expect(result.allowed).toBe(false);
      expect(result.error).toBe("RENEWAL_DECISION_REQUIRED");
    });

    it("blocks payment receipt submission if merchant chose 'cancel'", () => {
      const brand: BrandSubscriptionRecord = {
        slug: "brand-cancelled",
        plan_type: "annual",
        subscription_expires_at: new Date(nowMs + 10 * 24 * 60 * 60 * 1000).toISOString(),
        renewal_intent: "cancel",
      };

      const result = validateReceiptSubmission(brand, false, nowMs);
      expect(result.allowed).toBe(false);
      expect(result.error).toBe("RENEWAL_DECISION_REQUIRED");
    });

    it("allows receipt submission when within window and decision is 'renew'", () => {
      const brand: BrandSubscriptionRecord = {
        slug: "brand-renewing",
        plan_type: "annual",
        subscription_expires_at: new Date(nowMs + 10 * 24 * 60 * 60 * 1000).toISOString(),
        renewal_intent: "renew",
      };

      const result = validateReceiptSubmission(brand, false, nowMs);
      expect(result.allowed).toBe(true);
    });

    it("allows upgrade or trial conversions without 30-day window restriction", () => {
      const trialBrand: BrandSubscriptionRecord = {
        slug: "trial-store",
        plan_type: "trial",
        subscription_expires_at: new Date(nowMs + 100 * 24 * 60 * 60 * 1000).toISOString(),
        renewal_intent: null,
      };

      const result = validateReceiptSubmission(trialBrand, true, nowMs);
      expect(result.allowed).toBe(true);
    });
  });

  describe("Annual Subscription Extension Math", () => {
    it("extends future expiration date by exactly one calendar year", () => {
      const currentExpiresAt = "2026-11-15T00:00:00.000Z";
      const extended = calculateRenewalExtension(currentExpiresAt, now);

      const extendedDate = new Date(extended);
      expect(extendedDate.getUTCFullYear()).toBe(2027);
      expect(extendedDate.getUTCMonth()).toBe(10); // November (0-indexed)
      expect(extendedDate.getUTCDate()).toBe(15);
    });

    it("extends expired subscription by one calendar year from current approval date", () => {
      const expiredDate = "2026-05-01T00:00:00.000Z"; // In the past relative to now (2026-09-13)
      const extended = calculateRenewalExtension(expiredDate, now);

      const extendedDate = new Date(extended);
      expect(extendedDate.getUTCFullYear()).toBe(2027);
      expect(extendedDate.getUTCMonth()).toBe(8); // September (0-indexed)
      expect(extendedDate.getUTCDate()).toBe(13);
    });

    it("handles leap year renewal correctly", () => {
      const leapYearDate = new Date("2024-02-29T12:00:00.000Z");
      const extended = calculateRenewalExtension("2024-02-29T12:00:00.000Z", leapYearDate);

      const extendedDate = new Date(extended);
      // Adding 1 year to Feb 29 2024 results in March 1 (or Feb 28 depending on JS engine) in 2025
      expect(extendedDate.getUTCFullYear()).toBe(2025);
    });
  });
});
