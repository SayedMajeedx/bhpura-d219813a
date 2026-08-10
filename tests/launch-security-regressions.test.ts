import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { safeStorefrontRedirect } from "../src/routes/$slug.auth";

describe("launch security regressions", () => {
  it.each([
    "https://attacker.example/collect",
    "//attacker.example/collect",
    "/other-store/account",
    "/pura/auth",
    "/pura\\@attacker.example",
  ])("rejects unsafe storefront redirect %s", (redirect) => {
    expect(safeStorefrontRedirect(redirect, "pura")).toBeUndefined();
  });

  it("accepts same-store relative redirects", () => {
    expect(safeStorefrontRedirect("/pura/account?tab=orders", "pura")).toBe(
      "/pura/account?tab=orders",
    );
  });

  it("authorizes platform operations with the super-admin role only", () => {
    const source = readFileSync("src/lib/onboarding.functions.ts", "utf8");
    expect(source).toContain('rpc("is_super_admin")');
    expect(source).not.toContain('rpc("is_admin")');
    expect(source).not.toContain("isFixedSuperAdmin");
  });

  it("removes public tenant-request reads and unrestricted settings writes", () => {
    const migration = readFileSync(
      "supabase/migrations/20260808213000_lock_platform_settings_and_tenant_requests.sql",
      "utf8",
    );
    expect(migration).toContain('DROP POLICY IF EXISTS "Allow public select to tenant_requests"');
    expect(migration).toContain("REVOKE SELECT, UPDATE, DELETE");
    expect(migration).toContain("USING (public.is_super_admin())");
    expect(migration).toContain("WITH CHECK (public.is_super_admin())");
  });
});
