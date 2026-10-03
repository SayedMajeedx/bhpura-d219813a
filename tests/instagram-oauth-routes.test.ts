import { beforeEach, describe, expect, it, vi } from "vitest";
import { sealState } from "../src/lib/instagram-oauth.server";

// The two route handlers, called with real Requests. The database helpers and the
// environment are faked; Instagram is a stubbed fetch; the OAuth library is real.

const APP_SECRET = `secret-${crypto.randomUUID()}`;
const SHORT_TOKEN = `short-${crypto.randomUUID()}`;
const LONG_TOKEN = `long-${crypto.randomUUID()}`;
const BRAND = "0b39898a-0000-4000-8000-000000000001";

const env = vi.hoisted(() => ({ values: {} as Record<string, string | undefined> }));
const store = vi.hoisted(() => ({
  userWhoManagesBrand: vi.fn(),
  storeInstagramToken: vi.fn(async () => undefined),
  brandSlug: vi.fn(async () => "pura"),
}));
const middleware = { getEnvVariableAsync: async (name: string) => env.values[name] };
vi.mock("../src/integrations/supabase/auth-middleware", () => middleware);
vi.mock("@/integrations/supabase/auth-middleware", () => middleware);
vi.mock("../src/lib/instagram-oauth-store.server", () => store);
vi.mock("@/lib/instagram-oauth-store.server", () => store);

type Handler = (ctx: { request: Request }) => Promise<Response>;
const handlerOf = (route: unknown): Handler =>
  (route as { options: { server: { handlers: { GET: Handler } } } }).options.server.handlers.GET;

const authorize = handlerOf((await import("../src/routes/api.auth.instagram.authorize")).Route);
const callback = handlerOf((await import("../src/routes/api.auth.instagram.callback")).Route);

beforeEach(() => {
  vi.clearAllMocks();
  env.values = { INSTAGRAM_APP_ID: "1234567890", INSTAGRAM_APP_SECRET: APP_SECRET };
  store.userWhoManagesBrand.mockResolvedValue({ ok: true, userId: "user-1" });
  store.brandSlug.mockResolvedValue("pura");
});

const authorizeRequest = (headers: Record<string, string> = {}, brand = BRAND) =>
  new Request(`https://boutq.store/api/auth/instagram/authorize?brandId=${brand}`, { headers });

describe("starting the connection", () => {
  it("answers with Instagram's address and sets the signed state cookie", async () => {
    const response = await authorize({
      request: authorizeRequest({ authorization: "Bearer session-token" }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const { url } = (await response.json()) as { url: string };
    const address = new URL(url);
    expect(address.searchParams.get("scope")).toBe(
      "instagram_business_basic,instagram_business_manage_comments",
    );
    expect(address.searchParams.get("redirect_uri")).toBe(
      "https://boutq.store/api/auth/instagram/callback",
    );
    expect(url).not.toContain(APP_SECRET);

    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^ig_oauth_state=/);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(store.userWhoManagesBrand).toHaveBeenCalledWith("session-token", BRAND);
    // The state sent to Instagram is the nonce inside the cookie.
    const value = cookie.split(";")[0].split("=").slice(1).join("=");
    const payload = JSON.parse(atob(value.split(".")[0].replace(/-/g, "+").replace(/_/g, "/")));
    expect(payload).toMatchObject({ b: BRAND, u: "user-1", o: "https://boutq.store" });
    expect(address.searchParams.get("state")).toBe(payload.n);
  });

  it("refuses without a session, without access, with a bad store id, or without setup", async () => {
    expect((await authorize({ request: authorizeRequest() })).status).toBe(401);

    store.userWhoManagesBrand.mockResolvedValue({ ok: false, reason: "no_permission" });
    const forbidden = await authorize({
      request: authorizeRequest({ authorization: "Bearer session-token" }),
    });
    expect(forbidden.status).toBe(403);
    expect(forbidden.headers.get("set-cookie")).toBeNull();

    store.userWhoManagesBrand.mockResolvedValue({ ok: true, userId: "user-1" });
    expect(
      (await authorize({ request: authorizeRequest({ authorization: "Bearer t" }, "not-an-id") }))
        .status,
    ).toBe(400);

    env.values = {};
    const unset = await authorize({ request: authorizeRequest({ authorization: "Bearer t" }) });
    expect(unset.status).toBe(503);
    expect(((await unset.json()) as { code: string }).code).toBe("not_configured");
  });
});

describe("what the access check's answer means", () => {
  const ask = () =>
    authorize({ request: authorizeRequest({ authorization: "Bearer session-token" }) });

  it("refuses with 403 only when the database said no", async () => {
    for (const reason of ["no_access", "no_permission"] as const) {
      store.userWhoManagesBrand.mockResolvedValue({ ok: false, reason });
      const response = await ask();
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: "forbidden", reason });
      expect(response.headers.get("set-cookie")).toBeNull();
    }
  });

  it("reports a check that could not run as a server problem, not a refusal", async () => {
    store.userWhoManagesBrand.mockResolvedValue({
      ok: false,
      reason: "check_failed",
      detail: "PGRST301",
    });
    const failed = await ask();
    expect(failed.status).toBe(503);
    expect(await failed.json()).toMatchObject({
      code: "server_error",
      reason: "check_failed: PGRST301",
    });

    store.userWhoManagesBrand.mockResolvedValue({
      ok: false,
      reason: "server_config",
      detail: "SUPABASE_PUBLISHABLE_KEY",
    });
    const config = await ask();
    expect(config.status).toBe(503);
    expect(((await config.json()) as { code: string }).code).toBe("server_error");
  });

  it("answers 401 for a session that is not accepted", async () => {
    store.userWhoManagesBrand.mockResolvedValue({ ok: false, reason: "invalid_session" });
    const response = await ask();
    expect(response.status).toBe(401);
    expect(((await response.json()) as { code: string }).code).toBe("unauthorized");
  });
});

describe("the callback address", () => {
  const stateCookie = async (nonce = "nonce-abc") =>
    `ig_oauth_state=${await sealState(
      { n: nonce, b: BRAND, u: "user-1", o: "https://boutq.store", e: Date.now() + 60_000 },
      APP_SECRET,
    )}`;

  it("is handled here instead of falling through to the storefront", async () => {
    const response = await callback({
      request: new Request("https://boutq.store/api/auth/instagram/callback?code=abc&state=zzz"),
    });
    // No cookie: a plain page, not the storefront's "Storefront unavailable".
    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain("Instagram connection");
    expect(html).not.toContain("Storefront unavailable");
    // The page says which check failed, with a fixed word.
    expect(html).toContain("Reason: no_cookie");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("exchanges the code on the server, stores the token and returns to the screen", async () => {
    const requests: Array<{ url: string; method: string; body?: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
        requests.push({ url, method: init?.method ?? "GET", body: init?.body });
        const body = url.includes("api.instagram.com")
          ? {
              data: [
                {
                  access_token: SHORT_TOKEN,
                  user_id: "178414",
                  permissions: "instagram_business_basic,instagram_business_manage_comments",
                },
              ],
            }
          : url.includes("/access_token")
            ? { access_token: LONG_TOKEN, expires_in: 5_000_000 }
            : { user_id: "178414", username: "puraline.bh" };
        return { ok: true, status: 200, json: async () => body };
      }),
    );

    const response = await callback({
      request: new Request(
        "https://boutq.store/api/auth/instagram/callback?code=auth-code-123&state=nonce-abc",
        { headers: { cookie: await stateCookie() } },
      ),
    });
    vi.unstubAllGlobals();

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://boutq.store/admin/b/pura/giveaways?instagram=connected",
    );
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(new URLSearchParams(requests[0].body).get("client_secret")).toBe(APP_SECRET);
    expect(store.storeInstagramToken).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: BRAND, accessToken: LONG_TOKEN, username: "puraline.bh" }),
    );
    const everything = `${response.headers.get("location")}${response.headers.get("set-cookie")}`;
    for (const secret of [APP_SECRET, SHORT_TOKEN, LONG_TOKEN, "auth-code-123"]) {
      expect(everything).not.toContain(secret);
    }
  });

  it("sends a refusal back to the screen without calling Instagram", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const response = await callback({
      request: new Request(
        "https://boutq.store/api/auth/instagram/callback?error=access_denied&error_reason=user_denied&state=nonce-abc",
        { headers: { cookie: await stateCookie() } },
      ),
    });
    vi.unstubAllGlobals();
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("instagram_error=denied");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("says so, as a page, when the app secret is not configured", async () => {
    env.values = {};
    const response = await callback({
      request: new Request("https://boutq.store/api/auth/instagram/callback?code=abc&state=x"),
    });
    expect(response.status).toBe(503);
    expect(response.headers.get("content-type")).toContain("text/html");
  });
});
