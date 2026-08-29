import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260825193500_returning_customer_promo_eligibility.sql",
  "utf8",
);
const editor = readFileSync("src/routes/_authenticated/admin.b.$slug.discounts.tsx", "utf8");

describe("returning-customer promo eligibility", () => {
  it("stores the restriction and enforces a prior successful order server-side", () => {
    expect(migration).toContain("returning_customers_only boolean NOT NULL DEFAULT false");
    expect(migration).toContain("PREVIOUS_ORDER_REQUIRED");
    expect(migration).toContain("o.status IN ('completed', 'paid') OR o.payment_status = 'paid'");
  });

  it("prevents mutually exclusive customer audience settings", () => {
    expect(migration).toContain("NOT (first_time_customers_only AND returning_customers_only)");
    expect(editor).toContain("returning_customers_only: v ? false");
    expect(editor).toContain("first_time_customers_only: v ? false");
  });
});
