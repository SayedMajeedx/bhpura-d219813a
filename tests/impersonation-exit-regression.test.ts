import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Runs the real auth middleware with its server dependencies faked: a signed-in
// super admin, an impersonation cookie, and the platform's mutation policy.
const server = vi.hoisted(() => ({
  request: new Request("https://boutq.test/_server"),
  impersonating: true,
  mutationAllowed: false,
}));

vi.mock("@tanstack/react-start", () => ({
  // Keep the middleware's server function so the test can call it.
  createMiddleware: () => ({ server: (run: unknown) => ({ run }) }),
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => server.request }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { getClaims: async () => ({ data: { claims: { sub: "operator-1" } }, error: null }) },
  }),
}));
const cookies = {
  verifyImpersonationToken: async () => (server.impersonating ? { targetTenantId: "b1" } : null),
};
vi.mock("../src/lib/impersonation-cookies.server", () => cookies);
vi.mock("@/lib/impersonation-cookies.server", () => cookies);
const adminClient = {
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { superadmin_impersonation_mutation_allowed: server.mutationAllowed },
          }),
        }),
      }),
    }),
  },
};
vi.mock("../src/integrations/supabase/client.server", () => adminClient);
vi.mock("@/integrations/supabase/client.server", () => adminClient);

const middleware = await import("../src/integrations/supabase/auth-middleware");
type Runnable = { run: (args: { next: (value: unknown) => unknown }) => Promise<unknown> };
const run = (guard: unknown) => {
  const next = vi.fn((value: unknown) => value);
  return { result: (guard as Runnable).run({ next }), next };
};
const request = (method: string) =>
  new Request("https://boutq.test/_server", {
    method,
    headers: {
      authorization: "Bearer a.b.c",
      cookie: "boutq_impersonation_token=signed-token",
    },
  });

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://project.supabase.test");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  server.impersonating = true;
  server.mutationAllowed = false;
});
afterEach(() => vi.unstubAllEnvs());

describe("impersonation exit regression", () => {
  it("keeps impersonation read-only for normal authenticated mutations", async () => {
    server.request = request("POST");
    const { result, next } = run(middleware.requireSupabaseAuth);
    await expect(result).rejects.toThrow("Read-Only");
    expect(next).not.toHaveBeenCalled();
  });

  it("lets the exit (and start) of an impersonation session through", async () => {
    server.request = request("POST");
    expect(middleware.requireSupabaseAuthForImpersonationLifecycle).toBe(
      middleware.requireSupabaseAuthForImpersonationExit,
    );
    const { result, next } = run(middleware.requireSupabaseAuthForImpersonationExit);
    await expect(result).resolves.toMatchObject({ context: { userId: "operator-1" } });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("allows reads, mutations outside impersonation, and mutations the platform allows", async () => {
    server.request = request("GET");
    await expect(run(middleware.requireSupabaseAuth).result).resolves.toBeTruthy();

    server.request = request("POST");
    server.impersonating = false;
    await expect(run(middleware.requireSupabaseAuth).result).resolves.toBeTruthy();

    server.impersonating = true;
    server.mutationAllowed = true;
    await expect(run(middleware.requireSupabaseAuth).result).resolves.toBeTruthy();
  });

  it("refuses a request without a bearer token", async () => {
    server.request = new Request("https://boutq.test/_server", { method: "POST" });
    await expect(run(middleware.requireSupabaseAuth).result).rejects.toThrow("Unauthorized");
  });
});
