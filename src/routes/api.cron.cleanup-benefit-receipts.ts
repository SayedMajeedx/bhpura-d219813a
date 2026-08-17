import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/cron/cleanup-benefit-receipts")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { getEnvVariableAsync } = await import("@/integrations/supabase/auth-middleware");
        const cronSecret = (await getEnvVariableAsync("CRON_SECRET"))?.trim();
        const authorization = request.headers.get("authorization") ?? "";
        const { constantTimeSecretEqual } = await import("@/lib/security.server");
        if (
          !cronSecret ||
          !(await constantTimeSecretEqual(authorization, `Bearer ${cronSecret}`))
        ) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { cleanupBenefitReceipts } = await import("@/lib/benefit-receipt-cleanup.server");
        const result = await cleanupBenefitReceipts();
        return Response.json(result, { status: result.ok ? 200 : 207 });
      },
    },
  },
});
