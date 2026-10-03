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
        const access = await userWhoManagesBrand(accessToken, brandId);
        if (!access.ok) {
          const detail = access.detail ? `: ${access.detail}` : "";
          const reason = `${access.reason}${detail}`;
          if (access.reason === "invalid_session") {
            return json({ error: "Your session is not valid", code: "unauthorized", reason }, 401);
          }
          // Only a real answer from the database is a refusal; a check that could
          // not run is a server problem, and is reported as one.
          if (access.reason === "no_access" || access.reason === "no_permission") {
            return json({ error: "Forbidden", code: "forbidden", reason }, 403);
          }
          return json({ error: "Could not verify your access", code: "server_error", reason }, 503);
        }
        const user = { userId: access.userId };

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
