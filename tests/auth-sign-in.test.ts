import { beforeEach, describe, expect, it, vi } from "vitest";

// These tests must never reach a real network: any fetch fails loudly.
vi.stubGlobal("fetch", () => {
  throw new Error("Network access is blocked in sign-in helper tests");
});

type Call = { fn: string; args: unknown[] };
const calls: Call[] = [];
let reply: unknown = { data: {}, error: null };
const record =
  (fn: string) =>
  (...args: unknown[]) => {
    calls.push({ fn, args });
    return Promise.resolve(reply);
  };

const client = {
  supabase: {
    auth: {
      signInWithPassword: record("signInWithPassword"),
      signInWithPasskey: record("signInWithPasskey"),
      signInWithOAuth: record("signInWithOAuth"),
      signUp: record("signUp"),
      resetPasswordForEmail: record("resetPasswordForEmail"),
      exchangeCodeForSession: record("exchangeCodeForSession"),
      verifyOtp: record("verifyOtp"),
      setSession: record("setSession"),
      updateUser: record("updateUser"),
      registerPasskey: record("registerPasskey"),
      onAuthStateChange: (listener: unknown) => {
        calls.push({ fn: "onAuthStateChange", args: [listener] });
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
      passkey: { list: record("passkey.list"), delete: record("passkey.delete") },
    },
    rpc: record("rpc"),
  },
};
vi.mock("../src/integrations/supabase/client", () => client);
vi.mock("@/integrations/supabase/client", () => client);

const signIn = await import("../src/lib/auth/sign-in");

const failed = { message: "Invalid login credentials", status: 400 };

beforeEach(() => {
  calls.length = 0;
  reply = { data: {}, error: null };
});

describe("sign-in results", () => {
  it("come back unchanged, errors included, so pages keep their translated messages", async () => {
    reply = { data: { user: null, session: null }, error: failed };
    expect(await signIn.signInWithPassword("a@b.bh", "pw")).toBe(reply);
    expect(calls[0]).toEqual({
      fn: "signInWithPassword",
      args: [{ email: "a@b.bh", password: "pw" }],
    });
  });

  it("send Google sign-in back to the page given", async () => {
    await signIn.signInWithGoogle("https://pura.boutq.store/pura/auth-confirmed");
    expect(calls[0].args).toEqual([
      {
        provider: "google",
        options: { redirectTo: "https://pura.boutq.store/pura/auth-confirmed" },
      },
    ]);
  });

  it("tag a storefront sign-up with its store and confirmation page", async () => {
    await signIn.signUpStorefrontCustomer({
      email: "a@b.bh",
      password: "pw",
      name: "Fatima",
      brandSlug: "pura",
      emailRedirectTo: "https://x/pura/auth-confirmed",
    });
    expect(calls[0].args).toEqual([
      {
        email: "a@b.bh",
        password: "pw",
        options: {
          data: { name: "Fatima", phone: undefined, storefront_slug: "pura" },
          emailRedirectTo: "https://x/pura/auth-confirmed",
        },
      },
    ]);
  });
});

describe("storefront membership", () => {
  it("is a member only when the database says so", async () => {
    reply = { data: true, error: null };
    expect(await signIn.hasStorefrontMembership("pura")).toEqual({ isMember: true, error: null });
    reply = { data: null, error: failed };
    expect(await signIn.hasStorefrontMembership("pura")).toEqual({
      isMember: false,
      error: failed,
    });
    expect(calls[0].args).toEqual(["has_storefront_membership", { p_brand_slug: "pura" }]);
  });

  it("is activated with the name and phone given", async () => {
    await signIn.activateStorefrontMembership("pura", { phone: "97339001122" });
    expect(calls[0].args).toEqual([
      "activate_storefront_membership",
      { p_brand_slug: "pura", p_name: undefined, p_phone: "97339001122" },
    ]);
  });
});

describe("recovery and passwords", () => {
  it("send the reset email to the recovery page", async () => {
    await signIn.sendPasswordResetEmail("a@b.bh", "https://x/reset-password");
    expect(calls[0].args).toEqual(["a@b.bh", { redirectTo: "https://x/reset-password" }]);
  });

  it("verify a token-hash link with its type and restore an implicit-link session", async () => {
    await signIn.verifyEmailToken("hash", "recovery");
    await signIn.restoreSessionFromLink("at", "rt");
    expect(calls[0].args).toEqual([{ token_hash: "hash", type: "recovery" }]);
    expect(calls[1].args).toEqual([{ access_token: "at", refresh_token: "rt" }]);
  });

  it("set a new password, with account metadata only when given", async () => {
    await signIn.updatePassword("new-pw");
    await signIn.updatePassword("new-pw", { must_change_password: false });
    expect(calls.map((c) => c.args[0])).toEqual([
      { password: "new-pw" },
      { password: "new-pw", data: { must_change_password: false } },
    ]);
  });

  it("clear the first-login flag through its function", async () => {
    reply = { data: null, error: failed };
    expect(await signIn.completeFirstSignInPasswordChange()).toEqual({ error: failed });
    expect(calls[0].args).toEqual(["complete_first_sign_in_password_change"]);
  });
});

describe("passkeys", () => {
  it("list, register and delete through the auth client", async () => {
    await signIn.listPasskeys();
    await signIn.registerPasskey();
    await signIn.deletePasskey("pk1");
    expect(calls.map((c) => [c.fn, c.args])).toEqual([
      ["passkey.list", []],
      ["registerPasskey", []],
      ["passkey.delete", [{ passkeyId: "pk1" }]],
    ]);
  });
});
