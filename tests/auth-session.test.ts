import { beforeEach, describe, expect, it, vi } from "vitest";

// These tests must never reach a real network: any fetch fails loudly.
vi.stubGlobal("fetch", () => {
  throw new Error("Network access is blocked in session helper tests");
});

const calls: string[] = [];
let user: { id: string } | null = { id: "u1" };
let session: { access_token: string } | null = { access_token: "tok" };

const client = {
  supabase: {
    auth: {
      getUser: async () => {
        calls.push("getUser");
        return user
          ? { data: { user }, error: null }
          : { data: { user: null }, error: { message: "Auth session missing" } };
      },
      getSession: async () => {
        calls.push("getSession");
        return { data: { session }, error: null };
      },
      signOut: async () => {
        calls.push("signOut");
        return { error: null };
      },
    },
  },
};
vi.mock("../src/integrations/supabase/client", () => client);
vi.mock("@/integrations/supabase/client", () => client);

const auth = await import("../src/lib/auth/session");

beforeEach(() => {
  calls.length = 0;
  user = { id: "u1" };
  session = { access_token: "tok" };
});

describe("session helpers", () => {
  it("give the signed-in user, and none when it cannot be read", async () => {
    expect(await auth.getCurrentUser()).toEqual({ id: "u1" });
    user = null;
    expect(await auth.getCurrentUser()).toBeNull();
  });

  it("give the session and its access token, none when signed out", async () => {
    expect(await auth.getCurrentSession()).toEqual({ access_token: "tok" });
    expect(await auth.getAccessToken()).toBe("tok");
    session = null;
    expect(await auth.getAccessToken()).toBeNull();
  });

  it("sign out of this browser", async () => {
    await auth.signOut();
    expect(calls).toEqual(["signOut"]);
  });
});
