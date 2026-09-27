import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { setPromoAudience } from "../src/lib/promo-audience";

const migration = readFileSync(
  "supabase/migrations/20260825193500_returning_customer_promo_eligibility.sql",
  "utf8",
);

describe("returning-customer promo eligibility", () => {
  it("stores the restriction and enforces a prior successful order server-side", () => {
    expect(migration).toContain("returning_customers_only boolean NOT NULL DEFAULT false");
    expect(migration).toContain("PREVIOUS_ORDER_REQUIRED");
    expect(migration).toContain("o.status IN ('completed', 'paid') OR o.payment_status = 'paid'");
  });

  it("prevents mutually exclusive customer audience settings", () => {
    expect(migration).toContain("NOT (first_time_customers_only AND returning_customers_only)");
    // The editor turns one off when the other is turned on.
    const none = {
      code: "BACK10",
      first_time_customers_only: false,
      returning_customers_only: false,
    };
    const returning = setPromoAudience(none, "returning", true);
    expect(returning).toEqual({ ...none, returning_customers_only: true });
    expect(setPromoAudience(returning, "first_time", true)).toEqual({
      ...none,
      first_time_customers_only: true,
    });
    // Turning one off leaves the other as it was.
    expect(setPromoAudience(returning, "first_time", false)).toEqual(returning);
  });
});
