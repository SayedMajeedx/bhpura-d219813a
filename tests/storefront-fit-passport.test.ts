import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("storefront Fit Passport", () => {
  it("is available as a customer account tab", () => {
    const account = readFileSync("src/routes/$slug.account.tsx", "utf8");
    expect(account).toContain('value="fit"');
    expect(account).toContain("<StorefrontFitPassport");
    expect(account).toContain('t("مقاساتي", "My fit")');
  });

  it("requires consent and saves reusable measurements", () => {
    const component = readFileSync("src/components/storefront/StorefrontFitPassport.tsx", "utf8");
    expect(component).toContain("if (!consent)");
    expect(component).toContain('from("customer_fit_passports").upsert');
    expect(component).toContain("consent_to_store: true");
  });

  it("restricts writes to the authenticated customer's own record", () => {
    const migration = readFileSync(
      "supabase/migrations/20260903220000_storefront_fit_passport_access.sql",
      "utf8",
    );
    expect(migration).toContain("auth_user_id = auth.uid()");
    expect(migration).toContain("brand_id = customer_fit_passports.brand_id");
  });
});
