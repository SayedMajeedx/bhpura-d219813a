import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const card = readFileSync("src/components/subscription-card.tsx", "utf8");
const functions = readFileSync("src/lib/saas-subscription.functions.ts", "utf8");
const brands = readFileSync("src/routes/_authenticated/admin.brands.tsx", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260810225000_add_subscription_renewal_decisions.sql",
  "utf8",
);

describe("annual renewal decision window", () => {
  it("shows renewal controls only in the final 30 days or after expiry", () => {
    expect(card).toContain("expired || daysLeft <= 30");
    expect(card).toContain('renewalIntent === "renew"');
    expect(card).toContain("نعم، أريد التجديد");
    expect(card).toContain("لا، لن أجدد");
  });

  it("persists a tenant-scoped decision and blocks premature renewal uploads", () => {
    expect(functions).toContain('decision: z.enum(["renew", "cancel"])');
    expect(functions).toContain("RENEWAL_WINDOW_NOT_OPEN");
    expect(functions).toContain("RENEWAL_DECISION_REQUIRED");
    expect(functions).toContain('rpc("can_access_brand"');
  });

  it("surfaces the recorded decision to the super admin", () => {
    expect(brands).toContain("يرغب بالتجديد");
    expect(brands).toContain("لن يجدد");
    expect(migration).toContain("renewal_intent IN ('renew', 'cancel')");
  });
});
