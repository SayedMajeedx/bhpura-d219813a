import { createFileRoute } from "@tanstack/react-router";

const PAGE_TEXT: Record<string, string> = {
  invalid_state:
    "This Instagram connection link is no longer valid. Go back to the giveaways screen and press Connect again.",
};

function page(status: number, code: string, setCookie: string, reason?: string) {
  const text = PAGE_TEXT[code] ?? "The Instagram connection could not be completed.";
  // A fixed word from the OAuth library, never anything taken from the request.
  const detail = reason ? `<p style="color:#555;font-size:.85rem">Reason: ${reason}</p>` : "";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Instagram connection</title></head><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem"><h1 style="font-size:1.25rem">Instagram connection</h1><p>${text}</p>${detail}</body></html>`;
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Set-Cookie": setCookie,
    },
  });
}

/**
 * Where Instagram sends the browser after the user approves (or refuses) access:
 * /api/auth/instagram/callback?code=...&state=...  The server swaps the code for a
 * token, checks the granted permissions, stores the token, and returns the browser
 * to the giveaways screen. Without this route the address falls through to the
 * storefront layout, which reads "api" as a store name.
 */
export const Route = createFileRoute("/api/auth/instagram/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const oauth = await import("@/lib/instagram-oauth.server");
        const { getEnvVariableAsync } = await import("@/integrations/supabase/auth-middleware");
        const [appId, appSecret] = await Promise.all([
          getEnvVariableAsync("INSTAGRAM_APP_ID"),
          getEnvVariableAsync("INSTAGRAM_APP_SECRET"),
        ]);
        const clear = oauth.clearStateCookie(url.hostname);
        if (!appSecret?.trim()) return page(503, "not_configured", clear);

        const store = await import("@/lib/instagram-oauth-store.server");
        const result = await oauth.completeInstagramConnection(
          url.searchParams,
          oauth.readCookie(request.headers.get("cookie"), oauth.STATE_COOKIE),
          {
            fetcher: (input, init) => fetch(input, init),
            appId: appId?.trim() ?? "",
            appSecret: appSecret.trim(),
            saveToken: store.storeInstagramToken,
            slugFor: store.brandSlug,
          },
        );
        if (result.kind === "page") return page(result.status, result.code, clear, result.reason);
        return new Response(null, {
          status: 302,
          headers: { Location: result.location, "Set-Cookie": clear, "Cache-Control": "no-store" },
        });
      },
    },
  },
});
