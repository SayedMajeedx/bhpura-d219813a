import { createFileRoute } from "@tanstack/react-router";
import { refreshExpiringInstagramTokens } from "@/lib/instagram-oauth.server";

export const Route = createFileRoute("/api/cron/refresh-instagram-tokens")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { getEnvVariableAsync } = await import("@/integrations/supabase/auth-middleware");
        const cronSecret = (await getEnvVariableAsync("CRON_SECRET"))?.trim();
        const authorization = request.headers.get("authorization") ?? "";
        const { constantTimeSecretEqual } = await import("@/lib/security.server");

        // Allow cron secret OR service_role key
        const anonKey = (await getEnvVariableAsync("SUPABASE_ANON_KEY"))?.trim();
        const isCronAuthorized = cronSecret && (await constantTimeSecretEqual(authorization, `Bearer ${cronSecret}`));
        const isAnonAuthorized = anonKey && (await constantTimeSecretEqual(authorization, `Bearer ${anonKey}`));

        if (!isCronAuthorized && !isAnonAuthorized) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          const summary = await refreshExpiringInstagramTokens(10);
          return Response.json(
            {
              ok: summary.failed === 0,
              timestamp: new Date().toISOString(),
              summary,
            },
            { status: 200 },
          );
        } catch (err: any) {
          console.error("Cron job refresh-instagram-tokens failed:", err);
          return Response.json(
            {
              ok: false,
              error: err.message,
              timestamp: new Date().toISOString(),
            },
            { status: 500 },
          );
        }
      },
      POST: async ({ request }) => {
        // Support POST as well for webhooks / triggers
        const { getEnvVariableAsync } = await import("@/integrations/supabase/auth-middleware");
        const cronSecret = (await getEnvVariableAsync("CRON_SECRET"))?.trim();
        const authorization = request.headers.get("authorization") ?? "";
        const { constantTimeSecretEqual } = await import("@/lib/security.server");

        const anonKey = (await getEnvVariableAsync("SUPABASE_ANON_KEY"))?.trim();
        const isCronAuthorized = cronSecret && (await constantTimeSecretEqual(authorization, `Bearer ${cronSecret}`));
        const isAnonAuthorized = anonKey && (await constantTimeSecretEqual(authorization, `Bearer ${anonKey}`));

        if (!isCronAuthorized && !isAnonAuthorized) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          const summary = await refreshExpiringInstagramTokens(10);
          return Response.json(
            {
              ok: summary.failed === 0,
              timestamp: new Date().toISOString(),
              summary,
            },
            { status: 200 },
          );
        } catch (err: any) {
          console.error("Cron job refresh-instagram-tokens failed:", err);
          return Response.json(
            {
              ok: false,
              error: err.message,
              timestamp: new Date().toISOString(),
            },
            { status: 500 },
          );
        }
      },
    },
  },
});
