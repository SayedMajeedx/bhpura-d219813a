import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { safeStorefrontRedirect } from "../src/routes/$slug.auth";
import {
  signImpersonationPayload,
  verifyImpersonationToken,
} from "../src/lib/impersonation-cookies.server";

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

  it("signs and securely verifies impersonation session tokens with HMAC", async () => {
    const payload = {
      operatorId: "super-user-123",
      targetTenantId: "brand-456",
      issuedAt: Date.now(),
    };
    const signedToken = await signImpersonationPayload(payload);
    expect(signedToken).toMatch(/^[a-zA-Z0-9_-]+\.[a-f0-9]{64}$/);

    const verified = await verifyImpersonationToken(signedToken);
    expect(verified).not.toBeNull();
    expect(verified?.operatorId).toBe("super-user-123");
    expect(verified?.targetTenantId).toBe("brand-456");

    // Tampered payload must fail
    const tamperedPayload = Buffer.from(
      JSON.stringify({ ...payload, targetTenantId: "brand-attacker" }),
    ).toString("base64url");
    const tamperedToken = `${tamperedPayload}.${signedToken.split(".")[1]}`;
    const tamperedResult = await verifyImpersonationToken(tamperedToken);
    expect(tamperedResult).toBeNull();
  });

  it("enforces tenant authorization before retrieving vault secrets in auth-middleware", () => {
    const source = readFileSync("src/integrations/supabase/auth-middleware.ts", "utf8");
    expect(source).toContain("can_access_brand");
    expect(source).toContain("isSuperAdmin || profile?.brand_id === resolvedBrandId");
    expect(source).toContain("[Forbidden] Caller");
  });

  it("requires authentication middleware for export reporting endpoint", () => {
    const source = readFileSync("src/lib/export.functions.ts", "utf8");
    expect(source).toContain(".middleware([requireSupabaseAuth])");
    expect(source).toContain("context.supabase");
  });
});
