import { createFileRoute } from "@tanstack/react-router";
import { executeNabdaOtp, type NabdaOtpRequest } from "@/lib/nabda-otp.server";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export const Route = createFileRoute("/api/admin/nabda-otp")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authorization = request.headers.get("authorization") ?? "";
        const accessToken = authorization.startsWith("Bearer ")
          ? authorization.slice(7).trim()
          : "";
        if (!accessToken) return json({ error: "Unauthorized" }, 401);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: auth, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
        if (authError || !auth.user) return json({ error: "Unauthorized" }, 401);

        const { data: profile } = await (supabaseAdmin.from("profiles") as any)
          .select("role,status")
          .eq("id", auth.user.id)
          .maybeSingle();
        if (
          !profile ||
          profile.status !== "active" ||
          !["admin", "brand_admin", "super_admin"].includes(String(profile.role))
        ) {
          return json({ error: "Forbidden" }, 403);
        }

        let body: NabdaOtpRequest;
        try {
          body = await request.json<NabdaOtpRequest>();
        } catch {
          return json({ error: "Invalid request" }, 400);
        }
        if (!body || !["status", "send", "verify"].includes(body.action)) {
          return json({ error: "Invalid action" }, 400);
        }

        try {
          const result = await executeNabdaOtp(body);
          return json(result, result.ok ? 200 : result.enabled ? 400 : 503);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Nabda request failed";
          console.error(JSON.stringify({ event: "nabda_otp_pilot_failed", action: body.action }));
          return json({ ok: false, enabled: true, action: body.action, error: message }, 502);
        }
      },
    },
  },
});
