import { describe, it, expect } from "vitest";
import {
  isMarketingEligible,
  filterMarketingEligibleCustomers,
} from "../src/lib/marketing-eligibility";

describe("Marketing Campaign Consent & Eligibility", () => {
  it("rejects customers without explicit marketing consent (false or null)", () => {
    const noConsentFalse = isMarketingEligible(
      {
        phone: "+97333000111",
        marketing_consent: false,
        opted_out_at: null,
      },
      3,
    );
    expect(noConsentFalse.eligible).toBe(false);
    expect(noConsentFalse.reason).toContain("consent");

    const noConsentNull = isMarketingEligible(
      {
        phone: "+97333000111",
        marketing_consent: null,
        opted_out_at: null,
      },
      3,
    );
    expect(noConsentNull.eligible).toBe(false);
    expect(noConsentNull.reason).toContain("consent");

    const noConsentUndefined = isMarketingEligible(
      {
        phone: "+97333000111",
        opted_out_at: null,
      },
      3,
    );
    expect(noConsentUndefined.eligible).toBe(false);
    expect(noConsentUndefined.reason).toContain("consent");
  });

  it("rejects customers who have opted out, even if marketing_consent was true", () => {
    const optedOut = isMarketingEligible(
      {
        phone: "+97333000111",
        marketing_consent: true,
        opted_out_at: "2026-08-15T12:00:00Z",
      },
      5,
    );
    expect(optedOut.eligible).toBe(false);
    expect(optedOut.reason).toContain("opted out");
  });

  it("rejects customers with missing or invalid phone numbers", () => {
    const missingPhone = isMarketingEligible(
      {
        phone: null,
        marketing_consent: true,
        opted_out_at: null,
      },
      2,
    );
    expect(missingPhone.eligible).toBe(false);
    expect(missingPhone.reason).toContain("phone");

    const emptyPhone = isMarketingEligible(
      {
        phone: "   ",
        marketing_consent: true,
        opted_out_at: null,
      },
      2,
    );
    expect(emptyPhone.eligible).toBe(false);

    const invalidPhone = isMarketingEligible(
      {
        phone: "abc",
        marketing_consent: true,
        opted_out_at: null,
      },
      2,
    );
    expect(invalidPhone.eligible).toBe(false);
    expect(invalidPhone.reason).toContain("Invalid phone");
  });

  it("rejects customers with zero prior orders", () => {
    const noOrders = isMarketingEligible(
      {
        phone: "+97333000111",
        marketing_consent: true,
        opted_out_at: null,
      },
      0,
    );
    expect(noOrders.eligible).toBe(false);
    expect(noOrders.reason).toContain("no prior orders");
  });

  it("approves fully eligible customers meeting all criteria", () => {
    const fullyEligible = isMarketingEligible(
      {
        phone: "+97333000111",
        marketing_consent: true,
        opted_out_at: null,
      },
      1,
    );
    expect(fullyEligible.eligible).toBe(true);
    expect(fullyEligible.reason).toBeUndefined();
  });

  it("correctly filters a list of mixed candidates with crmStats map", () => {
    const candidates = [
      { id: "c-1", phone: "+97333000111", marketing_consent: true, opted_out_at: null }, // Eligible
      { id: "c-2", phone: "+97333000222", marketing_consent: false, opted_out_at: null }, // No consent
      { id: "c-3", phone: "+97333000333", marketing_consent: true, opted_out_at: "2026-08-01T00:00:00Z" }, // Opted out
      { id: "c-4", phone: null, marketing_consent: true, opted_out_at: null }, // No phone
      { id: "c-5", phone: "+97333000555", marketing_consent: true, opted_out_at: null }, // 0 orders
    ];

    const crmStats = new Map([
      ["c-1", { totalOrders: 4 }],
      ["c-2", { totalOrders: 2 }],
      ["c-3", { totalOrders: 1 }],
      ["c-4", { totalOrders: 3 }],
      ["c-5", { totalOrders: 0 }],
    ]);

    const eligible = filterMarketingEligibleCustomers(candidates, crmStats);
    expect(eligible).toHaveLength(1);
    expect(eligible[0].id).toBe("c-1");
  });
});
