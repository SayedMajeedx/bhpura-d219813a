import { beforeEach, describe, expect, it, vi } from "vitest";

// The check "may this signed-in user start the Instagram connection for this
// store?", with Supabase faked: the session lookup, the settings, and the two
// database checks the giveaways tables use. What matters is that an answer of "no"
// and a check that could not run are told apart.

const env = vi.hoisted(() => ({ values: {} as Record<string, string | undefined> }));
const supa = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  createClient: vi.fn(),
}));

const middleware = { getEnvVariableAsync: async (name: string) => env.values[name] };
vi.mock("../src/integrations/supabase/auth-middleware", () => middleware);
vi.mock("@/integrations/supabase/auth-middleware", () => middleware);
const admin = { supabaseAdmin: { auth: { getUser: supa.getUser } } };
vi.mock("../src/integrations/supabase/client.server", () => admin);
vi.mock("@/integrations/supabase/client.server", () => admin);
vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => {
    supa.createClient(...args);
    return { rpc: supa.rpc };
  },
}));

const { userWhoManagesBrand } = await import("../src/lib/instagram-oauth-store.server");

const answers = (access: unknown, permission: unknown) =>
  supa.rpc.mockImplementation(async (name: string) =>
    name === "can_access_brand" ? access : permission,
  );
const yes = { data: true, error: null, status: 200 };
const no = { data: false, error: null, status: 200 };

beforeEach(() => {
  vi.clearAllMocks();
  env.values = {
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  };
  supa.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  answers(yes, yes);
});

describe("who may start the connection", () => {
  it("lets a user who passes both database checks, asking as that user", async () => {
    expect(await userWhoManagesBrand("session-token", "brand-1")).toEqual({
      ok: true,
      userId: "user-1",
    });
    expect(supa.rpc).toHaveBeenCalledWith("can_access_brand", { _brand_id: "brand-1" });
    expect(supa.rpc).toHaveBeenCalledWith("has_permission", { p_permission: "manage_settings" });
    const [url, key, options] = supa.createClient.mock.calls[0] as unknown as [
      string,
      string,
      { global: { headers: Record<string, string> } },
    ];
    expect([url, key]).toEqual(["https://project.supabase.co", "sb_publishable_test"]);
    expect(options.global.headers.Authorization).toBe("Bearer session-token");
  });

  it("says no_access or no_permission only when the database answered no", async () => {
    answers(no, yes);
    expect(await userWhoManagesBrand("t", "b")).toEqual({ ok: false, reason: "no_access" });
    answers(yes, no);
    expect(await userWhoManagesBrand("t", "b")).toEqual({ ok: false, reason: "no_permission" });
  });

  it("reports a check that errored as check_failed, never as a refusal", async () => {
    answers({ data: null, error: { code: "PGRST301", message: "JWT problem" }, status: 401 }, yes);
    const result = await userWhoManagesBrand("t", "b");
    expect(result).toEqual({ ok: false, reason: "check_failed", detail: "PGRST301" });
    // The error message (which may name internals) is not carried.
    expect(JSON.stringify(result)).not.toContain("JWT problem");
  });

  it("falls back to the HTTP status when the error has no code", async () => {
    answers(yes, { data: null, error: { code: "", message: "x" }, status: 500 });
    expect(await userWhoManagesBrand("t", "b")).toEqual({
      ok: false,
      reason: "check_failed",
      detail: "500",
    });
  });

  it("rejects a session Supabase does not accept, without asking the database", async () => {
    supa.getUser.mockResolvedValue({ data: { user: null }, error: { message: "bad jwt" } });
    expect(await userWhoManagesBrand("t", "b")).toEqual({ ok: false, reason: "invalid_session" });
    expect(supa.rpc).not.toHaveBeenCalled();
  });

  it("names the missing setting, not a refusal, when the server lacks one", async () => {
    env.values = { SUPABASE_URL: "https://project.supabase.co" };
    expect(await userWhoManagesBrand("t", "b")).toEqual({
      ok: false,
      reason: "server_config",
      detail: "SUPABASE_PUBLISHABLE_KEY",
    });
    expect(supa.rpc).not.toHaveBeenCalled();
  });

  it("finds the settings the way the project auth middleware does", async () => {
    // A URL without its scheme, and the key only under the older VITE_ name.
    env.values = { VITE_SUPABASE_URL: "project.supabase.co", VITE_SUPABASE_ANON_KEY: "anon-key" };
    expect((await userWhoManagesBrand("t", "b")).ok).toBe(true);
    const [url, key] = supa.createClient.mock.calls[0] as unknown as [string, string];
    expect([url, key]).toEqual(["https://project.supabase.co", "anon-key"]);
  });
});
