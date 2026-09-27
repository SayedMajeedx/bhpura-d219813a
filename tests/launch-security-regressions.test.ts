import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { fakeSupabase, type ServerFn } from "./helpers/server-fn";

const state = vi.hoisted(() => ({
  admin: null as unknown,
  request: new Request("https://boutq.store/_server"),
}));
// Server functions and middleware run for real (recording stand-ins); the
// service-role client, the request and the Turnstile check are faked.
vi.mock("@tanstack/react-start", async () =>
  (await import("./helpers/server-fn")).serverFnModule(),
);
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => state.request }));
const adminClient = {
  get supabaseAdmin() {
    return state.admin;
  },
};
vi.mock("../src/integrations/supabase/client.server", () => adminClient);
vi.mock("@/integrations/supabase/client.server", () => adminClient);
const turnstile = { verifyOnboardingTurnstile: async () => true };
vi.mock("../src/lib/turnstile.server", () => turnstile);
vi.mock("@/lib/turnstile.server", () => turnstile);

const { safeStorefrontRedirect } = await import("../src/routes/$slug.auth");
const { signImpersonationPayload, verifyImpersonationToken } =
  await import("../src/lib/impersonation-cookies.server");
const middleware = await import("../src/integrations/supabase/auth-middleware");
const onboarding = (await import("../src/lib/onboarding.functions")) as unknown as Record<
  string,
  ServerFn
>;
const { generateExportData } = (await import("../src/lib/export.functions")) as unknown as {
  generateExportData: ServerFn;
};

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

  it("authorizes platform operations with the super-admin role only", async () => {
    const requestId = "2f2c8f7e-5a8d-4c55-9b7e-2f6f0c9f1a44";
    for (const name of ["approveTenantRequest", "rejectTenantRequest"]) {
      // A platform owner's email is not enough: only the database role counts.
      const caller = fakeSupabase({ rpc: { is_super_admin: false, is_admin: true } });
      await expect(
        onboarding[name]({
          data: { requestId },
          context: { ...caller, userId: "u1", claims: { email: "majeed@hotmail.com" } },
        }),
      ).rejects.toThrow("UNAUTHORIZED_SUPER_ADMIN_ONLY");
      expect(caller.supabase.rpc.mock.calls.map(([rpc]) => rpc)).toEqual(["is_super_admin"]);
      expect(caller.writes).toHaveLength(0);
    }
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

  it("enforces tenant authorization before retrieving vault secrets", async () => {
    // The caller works on the brand in the referer, not their own.
    state.request = new Request("https://boutq.store/_server", {
      headers: { referer: "https://boutq.store/admin/b/pura/settings" },
    });
    const lookup = async (canAccess: boolean) => {
      const caller = fakeSupabase({
        rows: { profiles: { brand_id: "own-brand", role: "brand_admin" }, brands: { id: "pura" } },
        rpc: { can_access_brand: canAccess },
      });
      const vault = fakeSupabase({
        rpc: { get_integration_credential_secret: [{ api_key: "vault-key", base_url: "" }] },
      });
      state.admin = vault.supabase;
      const result = await middleware.getGeminiCredentials(caller.supabase, "u1");
      return { result, vaultCalls: vault.supabase.rpc.mock.calls.map(([rpc]) => rpc) };
    };

    const outsider = await lookup(false);
    expect(outsider.vaultCalls).not.toContain("get_integration_credential_secret");
    expect(outsider.result.diagnostics).toContain("[Forbidden] Caller u1");

    const operator = await lookup(true);
    expect(operator.vaultCalls).toContain("get_integration_credential_secret");
    expect(operator.result.apiKey).toBe("vault-key");
  });

  it("runs report exports as the signed-in caller and strips contact details", async () => {
    expect(generateExportData.middleware).toEqual([middleware.requireSupabaseAuth]);
    // The RPC runs through the caller's client (RLS applies), not the service role.
    state.admin = null;
    const caller = fakeSupabase({
      rpc: {
        rpc_reporting_export: [
          { customer: "=HYPERLINK(1)", email: "a@b.c", phone: "3900", total: 30 },
        ],
      },
    });
    const result = (await generateExportData({
      data: {
        reportType: "customers",
        from: "2026-09-01",
        to: "2026-09-30",
        tz: "UTC",
        format: "csv",
      },
      context: caller,
    })) as { content?: string; data?: string };
    expect(caller.supabase.rpc).toHaveBeenCalledWith("rpc_reporting_export", expect.anything());
    const text = JSON.stringify(result);
    expect(text).not.toContain("a@b.c");
    expect(text).not.toContain("3900");
    expect(text).toContain("'=HYPERLINK(1)");
  });
});
