import "./lib/error-capture";

import handler from "@tanstack/react-start/server-entry";
import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import {
  checkProductionReadiness,
  createCorrelationId,
  logOperationalEvent,
  pruneHealthEvents,
  runObservedTask,
} from "./lib/observability.server";
import { handleR2MediaRequest } from "./lib/r2-media-server";

const SECURITY_HEADERS = {
  "Content-Security-Policy":
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://www.googletagmanager.com https://connect.facebook.net https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self' https://challenges.cloudflare.com https://*.supabase.co wss://*.supabase.co https://*.googleapis.com https://*.r2.cloudflarestorage.com https://media.boutq.store https://www.google-analytics.com https://region1.google-analytics.com https://www.googletagmanager.com https://connect.facebook.net https://static.cloudflareinsights.com https://cloudflareinsights.com; frame-src https://challenges.cloudflare.com; worker-src 'self' blob:; upgrade-insecure-requests",
  "Permissions-Policy": "camera=(self), microphone=(), geolocation=(), payment=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
} as const;

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  const error = consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`);
  console.error(error);
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

function withPerformanceCacheHeaders(request: Request, response: Response): Response {
  const url = new URL(request.url);
  if (
    response.status === 200 &&
    (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/fonts/"))
  ) {
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
  return response;
}

function withSecurityHeaders(response: Response, correlationId?: string): Response {
  if (response.status === 101) return response;
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }
  if (correlationId) headers.set("X-Request-ID", correlationId);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function runScheduledTasks(cron: string, env: Cloudflare.Env): Promise<void> {
  const g = globalThis as typeof globalThis & {
    __CLOUDFLARE_ENV__?: Cloudflare.Env;
  };
  g.__CLOUDFLARE_ENV__ = env;

  const correlationId = createCorrelationId();

  // Every task is isolated: one provider outage must never prevent the other
  // recovery loops from running.
  await runObservedTask(env, "tap_payment_reconciliation", correlationId, async () => {
    const { reconcileAbandonedTapPayments } =
      await import("./lib/tap-payment-reconciliation.server");
    return { cron, ...(await reconcileAbandonedTapPayments()) };
  });

  await runObservedTask(env, "order_email_retry", correlationId, async () => {
    const { retryOrderEmailOutbox } = await import("./lib/order-email-outbox.server");
    return { cron, ...(await retryOrderEmailOutbox(env)) };
  });

  await runObservedTask(env, "whatsapp_retry", correlationId, async () => {
    const { retryWhatsAppOutbox } = await import("./lib/meta-whatsapp.server");
    return { cron, ...(await retryWhatsAppOutbox(env)) };
  });

  if (cron === "17 2 * * *") {
    await runObservedTask(env, "benefit_receipt_cleanup", correlationId, async () => {
      const { cleanupBenefitReceipts } = await import("./lib/benefit-receipt-cleanup.server");
      return { cron, ...(await cleanupBenefitReceipts()) };
    });
    await runObservedTask(env, "health_event_retention", correlationId, async () => ({
      cron,
      ...(await pruneHealthEvents(env)),
    }));
  }
}

export default {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    const correlationId = createCorrelationId(request);
    try {
      // Synchronously bind Cloudflare env variables for global layout dehydration
      const g = globalThis as typeof globalThis & {
        __CLOUDFLARE_ENV__?: Cloudflare.Env;
      };
      g.__CLOUDFLARE_ENV__ = env;

      const url = new URL(request.url);
      if (url.pathname === "/api/health/live") {
        return withSecurityHeaders(
          Response.json(
            { status: "healthy", service: "boutq-web", timestamp: new Date().toISOString() },
            { headers: { "Cache-Control": "no-store" } },
          ),
          correlationId,
        );
      }

      if (url.pathname === "/api/health/ready") {
        const readiness = await checkProductionReadiness(env);
        return withSecurityHeaders(
          Response.json(
            { ...readiness, service: "boutq-web", timestamp: new Date().toISOString() },
            {
              status: readiness.status === "healthy" ? 200 : 503,
              headers: { "Cache-Control": "no-store" },
            },
          ),
          correlationId,
        );
      }

      if (url.pathname === "/api/public/webhooks/meta-whatsapp") {
        const { handleMetaWhatsAppWebhook } = await import("./lib/meta-whatsapp.server");
        return withSecurityHeaders(
          await handleMetaWhatsAppWebhook(request, env, ctx),
          correlationId,
        );
      }

      if (url.pathname === "/api/internal/white-label-builds/upload") {
        const { handleWhiteLabelApkUpload } = await import("./lib/white-label-builds.server");
        return withSecurityHeaders(await handleWhiteLabelApkUpload(request, env), correlationId);
      }

      if (
        url.hostname === "media.boutq.store" ||
        url.hostname.endsWith(".media.boutq.store") ||
        url.pathname.startsWith("/brands/") ||
        url.pathname.startsWith("/app-builds/")
      ) {
        return await handleR2MediaRequest(request, env);
      }

      const response = await handler.fetch(request);
      return withPerformanceCacheHeaders(
        request,
        withSecurityHeaders(await normalizeCatastrophicSsrResponse(response), correlationId),
      );
    } catch (error) {
      logOperationalEvent("error", "request_failed", {
        correlationId,
        method: request.method,
        path: new URL(request.url).pathname,
        error,
      });
      return withSecurityHeaders(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
        correlationId,
      );
    }
  },

  scheduled(controller: ScheduledController, env: Cloudflare.Env, ctx: ExecutionContext) {
    ctx.waitUntil(runScheduledTasks(controller.cron, env));
  },
} satisfies ExportedHandler<Cloudflare.Env>;
