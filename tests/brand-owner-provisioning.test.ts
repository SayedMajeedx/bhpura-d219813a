import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const brandsPage = readFileSync("src/routes/_authenticated/admin.brands.tsx", "utf8");
const userManagement = readFileSync("supabase/functions/user-management/index.ts", "utf8");

describe("brand owner provisioning contract", () => {
  it("requires owner identity in the super-admin brand form", () => {
    expect(brandsPage).toContain("owner_name: owner.name.trim()");
    expect(brandsPage).toContain("owner_email: owner.email.trim()");
    expect(brandsPage).toContain('action", "provision-brand"');
    expect(brandsPage).not.toContain('p_owner_name: "Super Admin Deployment"');
  });

  it("creates or links the owner as the first active brand admin", () => {
    expect(userManagement).toContain('case "provision-brand"');
    expect(userManagement).toContain('role: "brand_admin"');
    expect(userManagement).toContain("linked_existing_identity");
    expect(userManagement).toContain('brand_id: brandId');
  });

  it("uses the configured trial duration for manually provisioned brands", () => {
    expect(userManagement).toContain('.eq("code", "trial")');
    expect(userManagement).toContain("trialDays * 24 * 60 * 60 * 1000");
    expect(brandsPage).not.toContain("Date.now() + 3 * 24 * 60 * 60 * 1000");
  });

  it("protects the last active brand administrator", () => {
    expect(userManagement.match(/A brand must keep at least one active brand admin/g)).toHaveLength(
      2,
    );
  });
});
