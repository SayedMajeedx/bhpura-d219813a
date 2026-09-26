import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { brandRow, brandsPageMocks, renderBrandsPage } from "./helpers/brands-page";
import type { ServerFn } from "./helpers/server-fn";

const toast = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
  loading: vi.fn(() => "toast-1"),
}));
const page = vi.hoisted(() => ({ brands: [] as unknown[], cookieAtStart: "" }));
const impersonation = vi.hoisted(() => ({
  startImpersonationSession: vi.fn(async () => {
    page.cookieAtStart = document.cookie;
    throw new Error("Impersonation Mode is currently set to Read-Only by System Policy.");
  }),
}));
vi.mock("sonner", () => ({ toast }));

// Server functions: keep what createServerFn is given, so the test can check the
// middleware and call the handler.
vi.mock("@tanstack/react-start", async () =>
  (await import("./helpers/server-fn")).serverFnModule(),
);
const guards = {
  requireSupabaseAuth: { guard: "read-only safeguard" },
  requireSupabaseAuthForImpersonationExit: { guard: "impersonation lifecycle" },
  requireSupabaseAuthForImpersonationLifecycle: { guard: "impersonation lifecycle" },
};
vi.mock("../src/integrations/supabase/auth-middleware", () => guards);
vi.mock("@/integrations/supabase/auth-middleware", () => guards);
const serverSide = vi.hoisted(() => ({ supportAccess: true, audit: [] as unknown[] }));
const adminClient = {
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: "brand-1",
              slug: "qoffee",
              support_access_enabled: serverSide.supportAccess,
            },
            error: null,
          }),
        }),
      }),
      insert: async (row: unknown) => (serverSide.audit.push(row), { error: null }),
    }),
  },
};
vi.mock("../src/integrations/supabase/client.server", () => adminClient);
vi.mock("@/integrations/supabase/client.server", () => adminClient);
const cookies = {
  signImpersonationPayload: async () => "signed-token",
  writeImpersonationCookie: async () => undefined,
};
vi.mock("../src/lib/impersonation-cookies.server", () => cookies);
vi.mock("@/lib/impersonation-cookies.server", () => cookies);

// The brands page gets a stub for the server function it calls.
vi.mock("../src/lib/impersonation.functions", () => impersonation);
vi.mock("@/lib/impersonation.functions", () => impersonation);
const mocks = brandsPageMocks(page);
vi.mock("@tanstack/react-router", () => mocks.router);
vi.mock("../src/lib/data/brands", (io) => mocks.brands(io));
vi.mock("@/lib/data/brands", (io) => mocks.brands(io));
vi.mock("../src/lib/data/super-admin", (io) => mocks.superAdmin(io));
vi.mock("@/lib/data/super-admin", (io) => mocks.superAdmin(io));
vi.mock("@/components/super-admin/brand-wizard/BrandWizardDialog", () => mocks.wizard);
vi.mock("@/components/super-admin/WhiteLabelAppsPanel", () => mocks.whiteLabel);

const functions = (await vi.importActual(
  "../src/lib/impersonation.functions",
)) as unknown as Record<string, ServerFn>;
const TENANT = "7b0c8f7e-5a8d-4c55-9b7e-2f6f0c9f1a11";
const operator = (isSuperAdmin: boolean) => ({
  userId: "operator-1",
  // A platform owner's email is not enough: only the database role counts.
  claims: { email: "majeed@hotmail.com" },
  supabase: { rpc: vi.fn(async () => ({ data: isSuperAdmin, error: null })) },
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem("lang", "en");
  serverSide.supportAccess = true;
  serverSide.audit = [];
});

describe("impersonation lifecycle", () => {
  it("starts and stops sessions through the lifecycle guard; everything else stays read-only", () => {
    expect(functions.startImpersonationSession.middleware).toEqual([
      guards.requireSupabaseAuthForImpersonationLifecycle,
    ]);
    expect(functions.stopImpersonationSession.middleware).toEqual([
      guards.requireSupabaseAuthForImpersonationExit,
    ]);
    for (const name of [
      "getTenantAuditLogs",
      "toggleSupportAccess",
      "validateImpersonationSession",
    ]) {
      expect(functions[name].middleware).toEqual([guards.requireSupabaseAuth]);
    }
  });

  it("requires the dedicated super-admin role, without email bypasses", async () => {
    const outsider = operator(false);
    await expect(
      functions.startImpersonationSession({ data: { targetTenantId: TENANT }, context: outsider }),
    ).rejects.toThrow("UNAUTHORIZED_SUPER_ADMIN_ONLY");
    expect(outsider.supabase.rpc).toHaveBeenCalledWith("is_super_admin");
    expect(serverSide.audit).toHaveLength(0);

    const admin = operator(true);
    await expect(
      functions.startImpersonationSession({ data: { targetTenantId: TENANT }, context: admin }),
    ).resolves.toMatchObject({ success: true, slug: "qoffee", token: "signed-token" });
    expect(serverSide.audit).toEqual([
      expect.objectContaining({ operator_id: "operator-1", action_type: "impersonation_start" }),
    ]);
  });

  it("respects a store that turned support access off", async () => {
    serverSide.supportAccess = false;
    await expect(
      functions.startImpersonationSession({
        data: { targetTenantId: TENANT },
        context: operator(true),
      }),
    ).rejects.toThrow("disabled technical support access");
  });

  it("clears a stale cookie first and explains a failed launch without technical errors", async () => {
    page.brands = [brandRow()];
    document.cookie = "boutq_impersonation_token=stale-read-only; path=/";
    await renderBrandsPage();
    fireEvent.click(await screen.findByRole("button", { name: "Impersonate" }));
    await waitFor(() => expect(impersonation.startImpersonationSession).toHaveBeenCalledTimes(1));
    expect(page.cookieAtStart).not.toContain("stale-read-only");
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Unable to start store impersonation. Verify support access and try again.",
        { id: "toast-1" },
      ),
    );
  });
});
