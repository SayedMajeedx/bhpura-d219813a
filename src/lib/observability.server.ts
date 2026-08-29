type RuntimeEnv = {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

export type HealthStatus = "healthy" | "degraded" | "failed";

const SENSITIVE_KEY = /(authorization|cookie|token|secret|password|apikey|api_key|email|phone)/i;

export function createCorrelationId(request?: Request): string {
  const incoming = request?.headers.get("x-request-id")?.trim();
  if (incoming && /^[A-Za-z0-9._:-]{8,128}$/.test(incoming)) return incoming;
  return crypto.randomUUID();
}

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[truncated]";
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitize(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 50)
        .map(([key, item]) => [
          key,
          SENSITIVE_KEY.test(key) ? "[redacted]" : sanitize(item, depth + 1),
        ]),
    );
  }
  return typeof value === "string" && value.length > 1_000 ? `${value.slice(0, 1_000)}…` : value;
}

export function logOperationalEvent(
  level: "info" | "warn" | "error",
  event: string,
  fields: Record<string, unknown> = {},
): void {
  const safeFields = sanitize(fields) as Record<string, unknown>;
  const payload = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...safeFields,
  });
  if (level === "error") console.error(payload);
  else if (level === "warn") console.warn(payload);
  else console.log(payload);
}

function supabaseHeaders(key: string): HeadersInit {
  return {
    apikey: key,
    ...(key.startsWith("sb_secret_") ? {} : { Authorization: `Bearer ${key}` }),
    "Content-Type": "application/json",
  };
}

export async function recordHealthEvent(
  env: RuntimeEnv,
  event: {
    service: string;
    status: HealthStatus;
    correlationId: string;
    durationMs: number;
    metrics?: Record<string, unknown>;
    errorCode?: string;
  },
): Promise<void> {
  const baseUrl = env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!baseUrl || !key) return;
  try {
    const response = await fetch(`${baseUrl}/rest/v1/system_health_events`, {
      method: "POST",
      headers: { ...supabaseHeaders(key), Prefer: "return=minimal" },
      body: JSON.stringify({
        service: event.service,
        status: event.status,
        correlation_id: event.correlationId,
        duration_ms: event.durationMs,
        metrics: sanitize(event.metrics ?? {}),
        error_code: event.errorCode ?? null,
      }),
    });
    if (!response.ok) {
      logOperationalEvent("warn", "health_event_persist_failed", {
        service: event.service,
        statusCode: response.status,
      });
    }
  } catch (error) {
    logOperationalEvent("warn", "health_event_persist_failed", { service: event.service, error });
  }
}

export async function checkProductionReadiness(
  env: RuntimeEnv,
): Promise<{ status: HealthStatus; database: "up" | "down"; latencyMs: number }> {
  const startedAt = Date.now();
  const baseUrl = env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!baseUrl || !key) return { status: "failed", database: "down", latencyMs: 0 };

  try {
    const response = await fetch(`${baseUrl}/rest/v1/brands?select=id&limit=1`, {
      headers: supabaseHeaders(key),
      signal: AbortSignal.timeout(3_000),
    });
    return {
      status: response.ok ? "healthy" : "failed",
      database: response.ok ? "up" : "down",
      latencyMs: Date.now() - startedAt,
    };
  } catch {
    return { status: "failed", database: "down", latencyMs: Date.now() - startedAt };
  }
}

export async function pruneHealthEvents(env: RuntimeEnv): Promise<{ deleted: number }> {
  const baseUrl = env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!baseUrl || !key) throw new Error("OBSERVABILITY_DATABASE_NOT_CONFIGURED");
  const response = await fetch(`${baseUrl}/rest/v1/rpc/prune_system_health_events`, {
    method: "POST",
    headers: supabaseHeaders(key),
    body: JSON.stringify({ p_retention_days: 30 }),
  });
  if (!response.ok) throw new Error(`OBSERVABILITY_PRUNE_FAILED_${response.status}`);
  return { deleted: Number(await response.json()) || 0 };
}

export async function runObservedTask<T extends Record<string, unknown>>(
  env: RuntimeEnv,
  service: string,
  correlationId: string,
  task: () => Promise<T>,
): Promise<T | undefined> {
  const startedAt = Date.now();
  try {
    const result = await task();
    const failureCount =
      (typeof result.failed === "number" ? result.failed : 0) +
      (typeof result.errorCount === "number" ? result.errorCount : 0);
    const status: HealthStatus = result.ok === false || failureCount > 0 ? "degraded" : "healthy";
    logOperationalEvent(status === "healthy" ? "info" : "warn", `${service}_complete`, {
      correlationId,
      durationMs: Date.now() - startedAt,
      ...result,
    });
    await recordHealthEvent(env, {
      service,
      status,
      correlationId,
      durationMs: Date.now() - startedAt,
      metrics: result,
    });
    return result;
  } catch (error) {
    logOperationalEvent("error", `${service}_failed`, { correlationId, error });
    await recordHealthEvent(env, {
      service,
      status: "failed",
      correlationId,
      durationMs: Date.now() - startedAt,
      errorCode: error instanceof Error ? error.name : "UNKNOWN_ERROR",
    });
    return undefined;
  }
}
