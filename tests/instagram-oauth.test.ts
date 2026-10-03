import { describe, expect, it, vi } from "vitest";
import {
  allowedReturnOrigin,
  buildAuthorizeUrl,
  clearStateCookie,
  completeInstagramConnection,
  INSTAGRAM_REDIRECT_URI,
  openState,
  readCookie,
  sealState,
  stateCookie,
  type CallbackDeps,
  type OAuthState,
} from "../src/lib/instagram-oauth.server";

// Made at run time: literals would look like leaked secrets to the scanner.
const APP_SECRET = `secret-${crypto.randomUUID()}`;
const APP_ID = "1234567890";
const SHORT_TOKEN = `short-${crypto.randomUUID()}`;
const LONG_TOKEN = `long-${crypto.randomUUID()}`;
const NOW = Date.parse("2026-10-03T12:00:00Z");

const state = (over: Partial<OAuthState> = {}): OAuthState => ({
  n: "nonce-abc",
  b: "brand-1",
  u: "user-1",
  o: "https://boutq.store",
  e: NOW + 60_000,
  ...over,
});

type Reply = { ok?: boolean; status?: number; body: unknown };

/** A pretend Instagram: answers by address, and remembers every request. */
function fakeInstagram(replies: { token?: Reply; long?: Reply; profile?: Reply }) {
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  const fetcher: CallbackDeps["fetcher"] = async (url, init) => {
    calls.push({ url, method: init?.method ?? "GET", body: init?.body });
    const reply = url.includes("api.instagram.com/oauth/access_token")
      ? replies.token
      : url.includes("/access_token")
        ? replies.long
        : replies.profile;
    const r = reply ?? { ok: false, status: 500, body: {} };
    return { ok: r.ok ?? true, status: r.status ?? 200, json: async () => r.body };
  };
  return { fetcher, calls };
}

const GOOD = {
  token: {
    body: {
      data: [
        {
          access_token: SHORT_TOKEN,
          user_id: "178414",
          permissions: "instagram_business_basic,instagram_business_manage_comments",
        },
      ],
    },
  },
  long: { body: { access_token: LONG_TOKEN, token_type: "bearer", expires_in: 5_183_944 } },
  profile: { body: { user_id: "178414", username: "puraline.bh" } },
};

async function run(
  query: Record<string, string>,
  opts: {
    replies?: Parameters<typeof fakeInstagram>[0];
    cookie?: OAuthState | null | string;
    saveToken?: CallbackDeps["saveToken"];
    slug?: string | null;
  } = {},
) {
  const ig = fakeInstagram(opts.replies ?? GOOD);
  const saveToken = opts.saveToken ?? vi.fn(async () => undefined);
  const cookieValue =
    opts.cookie === null
      ? null
      : typeof opts.cookie === "string"
        ? opts.cookie
        : await sealState(opts.cookie ?? state(), APP_SECRET);
  const result = await completeInstagramConnection(new URLSearchParams(query), cookieValue, {
    fetcher: ig.fetcher,
    appId: APP_ID,
    appSecret: APP_SECRET,
    saveToken,
    slugFor: async () => (opts.slug === undefined ? "pura" : opts.slug),
    now: NOW,
  });
  return { result, calls: ig.calls, saveToken };
}

const noSecrets = (text: string) => {
  for (const secret of [APP_SECRET, SHORT_TOKEN, LONG_TOKEN]) expect(text).not.toContain(secret);
};

describe("the authorization address", () => {
  it("asks for both permissions on the registered redirect address", () => {
    const url = new URL(buildAuthorizeUrl(APP_ID, "nonce-abc"));
    expect(`${url.origin}${url.pathname}`).toBe("https://www.instagram.com/oauth/authorize");
    expect(url.searchParams.get("scope")).toBe(
      "instagram_business_basic,instagram_business_manage_comments",
    );
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://boutq.store/api/auth/instagram/callback",
    );
    expect(INSTAGRAM_REDIRECT_URI).toBe("https://boutq.store/api/auth/instagram/callback");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe(APP_ID);
    expect(url.searchParams.get("state")).toBe("nonce-abc");
    expect(url.searchParams.get("force_reauth")).toBe("true");
    noSecrets(url.toString());
  });
});

describe("the state cookie", () => {
  it("is read back only when untouched and not expired", async () => {
    const sealed = await sealState(state(), APP_SECRET);
    expect(await openState(sealed, APP_SECRET, NOW)).toEqual(state());
    expect(await openState(sealed, "another-secret", NOW)).toBeNull();
    expect(await openState(sealed, APP_SECRET, NOW + 120_000)).toBeNull();
    const [body, signature] = sealed.split(".");
    const edited = btoa(JSON.stringify(state({ b: "another-brand" }))).replace(/=+$/, "");
    expect(await openState(`${edited}.${signature}`, APP_SECRET, NOW)).toBeNull();
    expect(await openState(`${body}.`, APP_SECRET, NOW)).toBeNull();
    expect(await openState("garbage", APP_SECRET, NOW)).toBeNull();
    expect(await openState(null, APP_SECRET, NOW)).toBeNull();
  });

  it("is HttpOnly, Secure and SameSite=Lax, shared across boutq.store only", () => {
    const set = stateCookie("value", "boutq.store");
    expect(set).toContain("HttpOnly");
    expect(set).toContain("Secure");
    expect(set).toContain("SameSite=Lax");
    expect(set).toContain("Domain=boutq.store");
    expect(set).toContain("Max-Age=600");
    expect(stateCookie("value", "www.boutq.store")).toContain("Domain=boutq.store");
    expect(stateCookie("value", "localhost")).not.toContain("Domain=");
    expect(stateCookie("value", "evil-boutq.store.example.com")).not.toContain("Domain=");
    expect(clearStateCookie("boutq.store")).toContain("Max-Age=0");
  });

  it("finds its cookie among others", () => {
    expect(readCookie("a=1; ig_oauth_state=abc.def; b=2", "ig_oauth_state")).toBe("abc.def");
    expect(readCookie("a=1", "ig_oauth_state")).toBeNull();
    expect(readCookie(null, "ig_oauth_state")).toBeNull();
  });

  it("only returns the browser to the store's own site", () => {
    expect(allowedReturnOrigin("https://boutq.store")).toBe("https://boutq.store");
    expect(allowedReturnOrigin("https://www.boutq.store/anything")).toBe("https://www.boutq.store");
    expect(allowedReturnOrigin("http://localhost:5173")).toBe("http://localhost:5173");
    expect(allowedReturnOrigin("https://boutq.store.evil.com")).toBeNull();
    expect(allowedReturnOrigin("http://boutq.store")).toBeNull();
    expect(allowedReturnOrigin("javascript:alert(1)")).toBeNull();
    expect(allowedReturnOrigin("nonsense")).toBeNull();
  });
});

describe("the callback", () => {
  it("rejects a callback with no state cookie, without calling Instagram", async () => {
    const { result, calls, saveToken } = await run(
      { code: "c", state: "nonce-abc" },
      { cookie: null },
    );
    expect(result).toEqual({
      kind: "page",
      status: 400,
      code: "invalid_state",
      reason: "no_cookie",
    });
    expect(calls).toHaveLength(0);
    expect(saveToken).not.toHaveBeenCalled();
  });

  it("names why the state was rejected", async () => {
    const mismatch = await run({ code: "c", state: "something-else" });
    expect(mismatch.result).toMatchObject({ kind: "page", reason: "state_mismatch" });
    const missing = await run({ code: "c" });
    expect(missing.result).toMatchObject({ kind: "page", reason: "no_state" });
    for (const r of [mismatch, missing]) expect(r.calls).toHaveLength(0);
  });

  it("tells an expired or forged cookie from a missing one", async () => {
    const expired = await run({ code: "c", state: "nonce-abc" }, { cookie: state({ e: NOW - 1 }) });
    expect(expired.result).toMatchObject({
      kind: "page",
      code: "invalid_state",
      reason: "bad_cookie",
    });
    const forged = await run({ code: "c", state: "nonce-abc" }, { cookie: "x.y" });
    expect(forged.result).toMatchObject({
      kind: "page",
      code: "invalid_state",
      reason: "bad_cookie",
    });
  });

  it("does not return to a site that is not the store's", async () => {
    const { result } = await run(
      { code: "c", state: "nonce-abc" },
      { cookie: state({ o: "https://evil.example.com" }) },
    );
    expect(result).toMatchObject({ kind: "page", code: "invalid_state", reason: "bad_origin" });
  });

  it("rejects a state for a store that no longer exists", async () => {
    const { result } = await run({ code: "c", state: "nonce-abc" }, { slug: null });
    expect(result).toMatchObject({ kind: "page", reason: "unknown_store" });
  });

  it("returns to the giveaways screen when the user refuses", async () => {
    const { result, calls } = await run({
      error: "access_denied",
      error_reason: "user_denied",
      state: "nonce-abc",
    });
    expect(result).toEqual({
      kind: "redirect",
      location: "https://boutq.store/admin/b/pura/giveaways?instagram_error=denied",
    });
    expect(calls).toHaveLength(0);
  });

  it("reports a callback with no code", async () => {
    const { result, calls } = await run({ state: "nonce-abc" });
    expect(result).toMatchObject({ kind: "redirect" });
    expect((result as { location: string }).location).toContain("instagram_error=missing_code");
    expect(calls).toHaveLength(0);
  });

  it("swaps the code on the server, then the long-lived swap, and stores the token", async () => {
    const { result, calls, saveToken } = await run({ code: "auth-code-123", state: "nonce-abc" });

    // 1. The code exchange: a form POST carrying the secret and the exact redirect address.
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.instagram.com/oauth/access_token");
    const form = new URLSearchParams(calls[0].body);
    expect(form.get("client_id")).toBe(APP_ID);
    expect(form.get("client_secret")).toBe(APP_SECRET);
    expect(form.get("grant_type")).toBe("authorization_code");
    expect(form.get("redirect_uri")).toBe("https://boutq.store/api/auth/instagram/callback");
    expect(form.get("code")).toBe("auth-code-123");

    // 2. The long-lived swap on Instagram's own host, with the short token.
    const long = new URL(calls[1].url);
    expect(long.origin).toBe("https://graph.instagram.com");
    expect(long.pathname).toBe("/access_token");
    expect(long.searchParams.get("grant_type")).toBe("ig_exchange_token");
    expect(long.searchParams.get("access_token")).toBe(SHORT_TOKEN);

    // 3. The profile is read with the long-lived token.
    expect(new URL(calls[2].url).searchParams.get("access_token")).toBe(LONG_TOKEN);

    // The long-lived token is what is stored, with what was granted.
    expect(saveToken).toHaveBeenCalledWith({
      brandId: "brand-1",
      userId: "user-1",
      instagramUserId: "178414",
      username: "puraline.bh",
      accessToken: LONG_TOKEN,
      expiresIn: 5_183_944,
      scope: "instagram_business_basic,instagram_business_manage_comments",
    });

    // The browser is sent back with no token, secret or code in the address.
    expect(result).toEqual({
      kind: "redirect",
      location: "https://boutq.store/admin/b/pura/giveaways?instagram=connected",
    });
    noSecrets(JSON.stringify(result));
    expect(JSON.stringify(result)).not.toContain("auth-code-123");
  });

  it("does not store a token that lacks the comments permission", async () => {
    const { result, calls, saveToken } = await run(
      { code: "c", state: "nonce-abc" },
      {
        replies: {
          ...GOOD,
          token: {
            body: {
              data: [
                {
                  access_token: SHORT_TOKEN,
                  user_id: "1",
                  permissions: "instagram_business_basic",
                },
              ],
            },
          },
        },
      },
    );
    expect((result as { location: string }).location).toContain(
      "instagram_error=missing_comments_permission",
    );
    expect(saveToken).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
  });

  it("reads the other shapes Instagram answers with", async () => {
    const flat = await run(
      { code: "c", state: "nonce-abc" },
      {
        replies: {
          ...GOOD,
          token: {
            body: {
              access_token: SHORT_TOKEN,
              user_id: 178414,
              permissions: ["instagram_business_basic", "instagram_business_manage_comments"],
            },
          },
        },
      },
    );
    expect((flat.result as { location: string }).location).toContain("instagram=connected");
  });

  it("stores a token whose permissions Instagram did not list, and says so", async () => {
    const { result, saveToken } = await run(
      { code: "c", state: "nonce-abc" },
      { replies: { ...GOOD, token: { body: { access_token: SHORT_TOKEN, user_id: "1" } } } },
    );
    expect(saveToken).toHaveBeenCalledTimes(1);
    expect((result as { location: string }).location).toContain("permissions=unverified");
  });

  it("reports a refused code without leaking anything", async () => {
    const { result, saveToken } = await run(
      { code: "c", state: "nonce-abc" },
      {
        replies: {
          token: { ok: false, status: 400, body: { error_message: `bad ${APP_SECRET}` } },
        },
      },
    );
    expect((result as { location: string }).location).toContain("instagram_error=exchange_failed");
    expect(saveToken).not.toHaveBeenCalled();
    noSecrets(JSON.stringify(result));
  });

  it("reports a failed long-lived swap and a failed save", async () => {
    const noLong = await run(
      { code: "c", state: "nonce-abc" },
      { replies: { ...GOOD, long: { ok: false, status: 400, body: {} } } },
    );
    expect((noLong.result as { location: string }).location).toContain("long_lived_failed");

    const noSave = await run(
      { code: "c", state: "nonce-abc" },
      {
        saveToken: async () => {
          throw new Error(`db said ${LONG_TOKEN}`);
        },
      },
    );
    expect((noSave.result as { location: string }).location).toContain("save_failed");
    noSecrets(JSON.stringify(noSave.result));
  });

  it("still connects when only the profile lookup fails", async () => {
    const { result, saveToken } = await run(
      { code: "c", state: "nonce-abc" },
      { replies: { ...GOOD, profile: { ok: false, status: 500, body: {} } } },
    );
    expect(saveToken).toHaveBeenCalledWith(
      expect.objectContaining({ instagramUserId: "178414", username: null }),
    );
    expect((result as { location: string }).location).toContain("instagram=connected");
  });
});
