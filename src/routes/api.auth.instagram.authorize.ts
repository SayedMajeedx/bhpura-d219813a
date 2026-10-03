import { createFileRoute } from "@tanstack/react-router";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });

/**
 * Starts the Instagram connection for a store. The admin page calls this with its
 * session token; it answers with Instagram's authorization address and sets the
 * signed state cookie the callback will check. The browser then goes to Instagram.
 */
export const Route = createFileRoute("/api/auth/instagram/authorize")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const brandId = url.searchParams.get("brandId") ?? "";
        const authorization = request.headers.get("authorization") ?? "";
        const accessToken = authorization.startsWith("Bearer ")
          ? authorization.slice(7).trim()
          : "";
        if (!accessToken) return json({ error: "Unauthorized", code: "unauthorized" }, 401);
        if (!/^[0-9a-f-]{36}$/i.test(brandId))
          return json({ error: "Missing brandId", code: "bad_request" }, 400);

        const { getEnvVariableAsync } = await import("@/integrations/supabase/auth-middleware");
        const [appId, appSecret] = await Promise.all([
          getEnvVariableAsync("INSTAGRAM_APP_ID"),
          getEnvVariableAsync("INSTAGRAM_APP_SECRET"),
        ]);
        if (!appId?.trim() || !appSecret?.trim()) {
          return json({ error: "Instagram is not configured", code: "not_configured" }, 503);
        }

        const { userWhoManagesBrand } = await import("@/lib/instagram-oauth-store.server");
        const user = await userWhoManagesBrand(accessToken, brandId);
        if (!user) return json({ error: "Forbidden", code: "forbidden" }, 403);

        const oauth = await import("@/lib/instagram-oauth.server");
        const origin = oauth.allowedReturnOrigin(url.origin);
        if (!origin) return json({ error: "Unsupported site", code: "bad_request" }, 400);

        const nonce = oauth.randomState();
        const cookie = await oauth.sealState(
          { n: nonce, b: brandId, u: user.userId, o: origin, e: oauth.newExpiry() },
          appSecret.trim(),
        );
        return json({ url: oauth.buildAuthorizeUrl(appId.trim(), nonce) }, 200, {
          "Set-Cookie": oauth.stateCookie(cookie, url.hostname),
        });
      },
    },
  },
});
