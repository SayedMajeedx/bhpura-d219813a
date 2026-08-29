import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { computeWebhookHmacSignature } from "../public-api/public-api-security";
import type { WebhookEventName, WebhookEndpoint } from "../public-api/public-api.types";

export interface DispatchEventParams {
  brandId: string;
  eventName: WebhookEventName;
  payload: Record<string, any>;
}

export interface WebhookDispatchResult {
  endpointId: string;
  url: string;
  status: "delivered" | "failed";
  statusCode?: number;
  durationMs: number;
  error?: string;
}

/**
 * Dispatches an event payload to all active webhook subscribers of a brand
 */
export async function dispatchBrandWebhookEvent(
  params: DispatchEventParams,
): Promise<WebhookDispatchResult[]> {
  const { brandId, eventName, payload } = params;

  // 1. Fetch active endpoints subscribed to this event
  const { data: endpointsData, error } = await (supabaseAdmin as any)
    .from("brand_webhook_endpoints")
    .select("*")
    .eq("brand_id", brandId)
    .eq("is_active", true);

  const endpoints: WebhookEndpoint[] = (endpointsData || []) as WebhookEndpoint[];

  if (error || endpoints.length === 0) {
    return [];
  }

  const matchingEndpoints = endpoints.filter((ep) =>
    ep.subscribed_events?.includes(eventName) || (ep.subscribed_events as any)?.includes("*"),
  );

  const results: WebhookDispatchResult[] = [];

  for (const endpoint of matchingEndpoints) {
    const eventId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const timestamp = Math.floor(Date.now() / 1000);
    const serializedPayload = JSON.stringify({
      id: eventId,
      event: eventName,
      created_at: new Date().toISOString(),
      data: payload,
    });

    const signature = await computeWebhookHmacSignature(
      endpoint.secret,
      timestamp,
      serializedPayload,
    );

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "Boutq-Webhooks/1.0",
      "X-Boutq-Signature": signature,
      "X-Boutq-Event-ID": eventId,
      "X-Boutq-Delivery-Attempt": "1",
    };

    const startTime = Date.now();
    let responseStatus: number | null = null;
    let responseText: string | null = null;
    let isSuccess = false;
    let errorMessage: string | null = null;

    try {
      const response = await fetch(endpoint.url, {
        method: "POST",
        headers,
        body: serializedPayload,
        signal: AbortSignal.timeout(10000), // 10s timeout
      });

      responseStatus = response.status;
      responseText = (await response.text()).slice(0, 2048); // limit stored response
      isSuccess = response.ok;
    } catch (err: any) {
      errorMessage = err?.message || "Connection failed or timed out";
      responseText = errorMessage;
    }

    const durationMs = Date.now() - startTime;

    // 2. Insert into delivery log
    await (supabaseAdmin as any).from("webhook_delivery_logs").insert({
      brand_id: brandId,
      endpoint_id: endpoint.id,
      event_id: eventId,
      event_name: eventName,
      payload: JSON.parse(serializedPayload),
      request_headers: headers,
      response_status: responseStatus,
      response_body: responseText,
      duration_ms: durationMs,
      attempt: 1,
      status: isSuccess ? "delivered" : "failed",
    });

    // 3. Update consecutive failures & auto-pause breaker
    if (!isSuccess) {
      const nextFailures = (endpoint.consecutive_failures || 0) + 1;
      const shouldAutoDisable = nextFailures >= 10;

      await (supabaseAdmin as any)
        .from("brand_webhook_endpoints")
        .update({
          consecutive_failures: nextFailures,
          is_active: shouldAutoDisable ? false : true,
          disabled_reason: shouldAutoDisable
            ? "Auto-disabled: 10 consecutive delivery failures"
            : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", endpoint.id);
    } else if (endpoint.consecutive_failures > 0) {
      await (supabaseAdmin as any)
        .from("brand_webhook_endpoints")
        .update({
          consecutive_failures: 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", endpoint.id);
    }

    results.push({
      endpointId: endpoint.id,
      url: endpoint.url,
      status: isSuccess ? "delivered" : "failed",
      statusCode: responseStatus ?? undefined,
      durationMs,
      error: errorMessage ?? undefined,
    });
  }

  return results;
}

/**
 * Sends a test ping payload to a specific webhook endpoint
 */
export async function sendTestWebhookPing(
  endpointId: string,
  brandId: string,
): Promise<{
  success: boolean;
  statusCode?: number;
  durationMs: number;
  responseBody?: string;
  error?: string;
}> {
  const { data: endpointData, error } = await (supabaseAdmin as any)
    .from("brand_webhook_endpoints")
    .select("*")
    .eq("id", endpointId)
    .eq("brand_id", brandId)
    .single();

  const endpoint = endpointData as WebhookEndpoint | null;

  if (error || !endpoint) {
    return { success: false, durationMs: 0, error: "Endpoint not found" };
  }

  const eventId = `evt_test_${Date.now()}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const samplePayload = JSON.stringify({
    id: eventId,
    event: "ping",
    created_at: new Date().toISOString(),
    data: {
      message: "Webhook verification ping from Boutq OS Developer Platform",
      brand_id: brandId,
      endpoint_id: endpoint.id,
      timestamp,
    },
  });

  const signature = await computeWebhookHmacSignature(
    endpoint.secret,
    timestamp,
    samplePayload,
  );

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "Boutq-Webhooks/1.0",
    "X-Boutq-Signature": signature,
    "X-Boutq-Event-ID": eventId,
    "X-Boutq-Delivery-Attempt": "1",
  };

  const startTime = Date.now();
  let statusCode: number | null = null;
  let responseBody: string | null = null;
  let isSuccess = false;
  let errorMsg: string | null = null;

  try {
    const res = await fetch(endpoint.url, {
      method: "POST",
      headers,
      body: samplePayload,
      signal: AbortSignal.timeout(10000),
    });
    statusCode = res.status;
    responseBody = (await res.text()).slice(0, 2048);
    isSuccess = res.ok;
  } catch (err: any) {
    errorMsg = err?.message || "Connection failed";
    responseBody = errorMsg;
  }

  const durationMs = Date.now() - startTime;

  // Record test log
  await (supabaseAdmin as any).from("webhook_delivery_logs").insert({
    brand_id: brandId,
    endpoint_id: endpoint.id,
    event_id: eventId,
    event_name: "order.created" as WebhookEventName, // sample
    payload: JSON.parse(samplePayload),
    request_headers: headers,
    response_status: statusCode,
    response_body: responseBody,
    duration_ms: durationMs,
    attempt: 1,
    status: isSuccess ? "delivered" : "failed",
  });

  return {
    success: isSuccess,
    statusCode: statusCode ?? undefined,
    durationMs,
    responseBody: responseBody ?? undefined,
    error: errorMsg ?? undefined,
  };
}
