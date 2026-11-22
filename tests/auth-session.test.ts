import { beforeEach, describe, expect, it, vi } from "vitest";

// These tests must never reach a real network: any fetch fails loudly.
vi.stubGlobal("fetch", () => {
  throw new Error("Network access is blocked in session helper tests");
});

const calls: string[] = [];
let user: { id: string } | null = { id: "u1" };
let session: { access_token: string } | null = { access_token: "tok" };
let claimsError: { name: string; status?: number } | null = null;

const client = {
  supabase: {
    auth: {
      getUser: async () => {
        calls.push("getUser");
        return { data: { user }, error: null };
      },
      // The token is checked on this device: its claims, then the session's own user.
      getClaims: async () => {
        calls.push("getClaims");
        if (claimsError) return { data: null, error: claimsError };
        return user
          ? { data: { claims: { sub: user.id } }, error: null }
          : { data: null, error: null };
      },
      getSession: async () => {
        calls.push("getSession");
        return { data: { session: session && user ? { ...session, user } : session }, error: null };
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
  claimsError = null;
});

describe("session helpers", () => {
  it("give the signed-in user, and none when it cannot be read", async () => {
    expect(await auth.getCurrentUser()).toEqual({ id: "u1" });
    user = null;
    expect(await auth.getCurrentUser()).toBeNull();
  });

  it("check the signed-in user on this device, never asking Auth", async () => {
    expect(await auth.verifiedUser()).toEqual({ id: "u1" });
    expect(calls).not.toContain("getUser");
  });

  it("let a guard try again when Auth could not be reached, and read a bad token as none", async () => {
    claimsError = { name: "AuthRetryableFetchError", status: 0 };
    await expect(auth.verifiedUser()).rejects.toBeTruthy();
    expect(await auth.getCurrentUser()).toBeNull();
    claimsError = { name: "AuthInvalidJwtError", status: 400 };
    expect(await auth.verifiedUser()).toBeNull();
  });

  it("give the session and its access token, none when signed out", async () => {
    expect(await auth.getCurrentSession()).toEqual({ access_token: "tok", user: { id: "u1" } });
    expect(await auth.getAccessToken()).toBe("tok");
    session = null;
    expect(await auth.getAccessToken()).toBeNull();
  });

  it("sign out of this browser", async () => {
    await auth.signOut();
    expect(calls).toEqual(["signOut"]);
  });
});
